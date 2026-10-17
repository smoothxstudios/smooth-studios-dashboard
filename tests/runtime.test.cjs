const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sources = ['feed-model.js', 'script.js'].map(name => fs.readFileSync(path.join(root, name), 'utf8'));
const NOW = Date.parse('2026-10-17T22:00:00Z');
const CACHE_KEY = 'smooth-welcome-tv-v2';
const event = (studio, firstName, startMinutes, endMinutes) => ({ studio, firstName,
  startISO: new Date(NOW + startMinutes * 60000).toISOString(),
  endISO: new Date(NOW + endMinutes * 60000).toISOString() });
const schedule = events => ({ schemaVersion: 2, ok: true, events });

// The harness exposes only browser operations and rendered output. No runtime
// functions or closed-over application state are accessed by these tests.
function browser({ search = '', saved, online = true, fromHTML = false } = {}) {
  let now = NOW;
  let timerId = 0;
  let requestCount = 0;
  const timers = new Map();
  const scripts = [];
  const storage = new Map(saved === undefined ? [] : [[CACHE_KEY, saved]]);
  const storageWrites = [];
  const windowEvents = new Map();
  const documentEvents = new Map();
  function node(id, attributes = {}) {
    return { id, textContent: '', hidden: Object.hasOwn(attributes, 'hidden'), attributes,
      getAttribute(key) { return this.attributes[key] ?? null; },
      setAttribute(key, value) { this.attributes[key] = String(value); } };
  }
  const elements = {};
  for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const attrs = Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    if (/\shidden(?:\s|>)/.test(match[0])) attrs.hidden = '';
    elements[match[1]] = node(match[1], attrs);
  }
  for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>([^<]*)<\//g)) {
    elements[match[1]].textContent = match[2];
  }
  function listen(registry, name, handler) {
    if (!registry.has(name)) registry.set(name, []);
    registry.get(name).push(handler);
  }
  function emit(registry, name, event = {}) { for (const handler of registry.get(name) || []) handler(event); }
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const document = {
    hidden: false,
    body: node('body'),
    querySelectorAll(selector) { assert.equal(selector, '[id]'); return Object.values(elements); },
    createElement(tag) {
      assert.equal(tag, 'script');
      return { remove() { const index = scripts.indexOf(this); if (index >= 0) scripts.splice(index, 1); } };
    },
    head: { appendChild(script) { requestCount++; scripts.push(script); } },
    addEventListener(name, handler) { listen(documentEvents, name, handler); }
  };
  const context = vm.createContext({ document, Date: ClockDate, Intl, URLSearchParams,
    location: { search }, navigator: { onLine: online },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storageWrites.push(['set', key, value]); storage.set(key, value); },
      removeItem(key) { storageWrites.push(['remove', key]); storage.delete(key); }
    },
    setTimeout(fn, delay = 0) { const id = ++timerId; timers.set(id, { fn, at: now + Number(delay) }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, handler) { listen(windowEvents, name, handler); }
  });
  context.window = context;
  if (fromHTML) {
    for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)) {
      const file = match[1].split('?')[0];
      vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    }
  } else {
    sources.forEach((source, index) => vm.runInContext(source, context, { filename: ['feed-model.js', 'script.js'][index] }));
  }
  return {
    elements, document, storage, storageWrites,
    requests: () => requestCount,
    pending: () => scripts.length,
    timers: () => timers.size,
    text: id => elements[id]?.textContent,
    callbackNames: () => Object.keys(context).filter(key => /^smoothFeed_/.test(key)),
    respond(data) {
      assert.equal(scripts.length, 1, 'Exactly one JSONP request should be pending');
      const script = scripts[0];
      const callback = new URL(script.src).searchParams.get('callback');
      assert.equal(typeof context[callback], 'function');
      context[callback](data);
      script.onload?.();
    },
    reject() { assert.equal(scripts.length, 1); scripts[0].onerror(); },
    setHidden(value) { document.hidden = value; emit(documentEvents, 'visibilitychange'); },
    online(value) { context.navigator.onLine = value; emit(windowEvents, value ? 'online' : 'offline'); },
    emit(name, value) { emit(windowEvents, name, value); },
    advance(ms) {
      const until = now + ms;
      let count = 0;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > until) break;
        assert.ok(++count < 10000, 'Timers must not spin without time advancing');
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
      }
      now = until;
    }
  };
}

function cached(events, savedAt = NOW - 1000, legacy = false) {
  return JSON.stringify({ savedAt, feed: { legacy, events: events.map(raw => ({
    firstName: raw.firstName, studio: raw.studio, startMs: Date.parse(raw.startISO),
    endMs: raw.endISO ? Date.parse(raw.endISO) : null
  })) } });
}

const displays = [{ studio: 'A', search: '', prefix: 'a', opposite: 'B' },
  { studio: 'B', search: '?studio=b', prefix: 'b', opposite: 'A' }];
function assertRoomIdentity(h, display) {
  assert.match(h.document.title, new RegExp(`Studio ${display.studio}\\b`));
  assert.equal(h.document.body.getAttribute('data-studio'), display.studio);
  assert.equal(h.elements[`studio${display.opposite}`].hidden, true);
  assert.equal(h.elements.studioUnassigned, undefined, 'The display has no unassigned-room panel');
}
function assertGuestAbsent(h, ...names) {
  const text = Object.values(h.elements).map(element => element.textContent).join('\n');
  for (const name of names) assert.ok(!text.includes(name), `${name} must never be rendered in this room`);
}
function assertGreeting(h, name = '') {
  assert.equal(h.text('heroStudio'), name ? 'Smooth Studios,' : 'Smooth Studios.');
  assert.equal(h.text('heroGuest'), name ? `${name}.` : '');
  assert.equal(h.elements.heroGuest.hidden, !name);
}
function assertNext(h, prefix, name = '') {
  assert.equal(h.elements[`${prefix}NextRow`].hidden, !name);
  if (name) {
    assert.equal(h.text(`${prefix}NextLabel`), 'Up next');
    assert.ok(h.text(`${prefix}Next`).includes(name));
  } else {
    assert.equal(h.text(`${prefix}Next`), '', 'An irrelevant next row must not retain a guest or courtesy message');
  }
}
function assertProgress(h, prefix, value = null) {
  const progress = h.elements[`${prefix}Progress`];
  assert.equal(progress.hidden, value === null);
  assert.equal(Number(progress.getAttribute('value')), value ?? 0);
  assert.equal(progress.getAttribute('aria-valuetext'), value === null ? '' : `${h.text(`${prefix}Timer`)} remaining`);
}

test('the actual HTML entry point boots its dependencies in order and is fully read-only', () => {
  const h = browser({ fromHTML: true });
  assert.equal(h.pending(), 1);
  assert.equal(h.text('connectionStatus'), 'Connecting to schedule');
  assert.doesNotMatch(html, /<(?:a|button|input|select|textarea|form|summary)\b/i);
  assert.doesNotMatch(html, /\b(?:contenteditable|onclick|onkeydown)\s*=/i);
  assert.doesNotMatch(html, /\brole\s*=\s*["'](?:button|link)["']/i);
});

test('initial load identifies its room while a single request waits; no premature empty-room claim', () => {
  for (const display of displays) {
    const h = browser({ search: display.search });
    assertRoomIdentity(h, display);
    assertGreeting(h);
    assertNext(h, display.prefix);
    assertProgress(h, display.prefix);
    assert.equal(h.elements.sessionBoard.hidden, true);
    assert.equal(h.elements.idleWelcome.hidden, false);
    assert.equal(h.text('connectionStatus'), 'Connecting to schedule');
    assert.equal(h.pending(), 1);
    h.advance(14000);
    assert.equal(h.requests(), 1);
    assert.equal(h.pending(), 1);
  }
});

test('concurrent bookings show only the selected room with independent countdowns and row labels', () => {
  const feed = schedule([event('A', 'Alex', -30, 7), event('B', 'Jordan', -10, 90),
    event('A', 'Taylor', 10, 60), event('B', 'Morgan', 100, 160), event(null, 'UnassignedGuest', -10, 90)]);
  for (const display of displays) {
    const h = browser({ search: display.search });
    h.respond(feed);
    assertRoomIdentity(h, display);
    assert.equal(h.elements.sessionBoard.hidden, false);
    assert.equal(h.elements[`studio${display.studio}`].hidden, false);
    assert.equal(h.elements.roomGrid.getAttribute('data-layout'), 'single');
    if (display.studio === 'A') {
      assertGreeting(h, 'Alex');
      assert.equal(h.text('aTimer'), '7:00');
      assertProgress(h, 'a', 18.92);
      assert.equal(h.elements.studioA.getAttribute('data-urgent'), 'true');
      assertNext(h, 'a', 'Taylor');
      assertGuestAbsent(h, 'Jordan', 'Morgan', 'UnassignedGuest');
    } else {
      assertGreeting(h, 'Jordan');
      assert.equal(h.text('bTimer'), '1:30:00');
      assertProgress(h, 'b', 90);
      assert.equal(h.elements.studioB.getAttribute('data-urgent'), 'false');
      assertNext(h, 'b');
      assertGuestAbsent(h, 'Alex', 'Taylor', 'Morgan', 'UnassignedGuest');
    }
  }
});

test('remaining-time progress starts full, drains through halfway, and clears when the session ends', () => {
  const h = browser();
  h.respond(schedule([event('A', 'Alex', 0, 1)]));
  assert.equal(Number(h.elements.aProgress.getAttribute('max')), 100);
  assertProgress(h, 'a', 100);
  assert.equal(h.elements.aProgress.getAttribute('aria-valuetext'), '1:00 remaining');
  h.advance(30020);
  const halfway = Number(h.elements.aProgress.getAttribute('value'));
  assert.ok(Math.abs(halfway - 50) < 0.1, 'Half the booking duration leaves half the bar');
  assertProgress(h, 'a', halfway);
  assert.equal(h.elements.aProgress.getAttribute('aria-valuetext'), '0:30 remaining');
  h.advance(30000);
  assertProgress(h, 'a');
  assertGreeting(h);
});

test('an actual next booking appears only when the selected session reaches its final ten minutes', () => {
  const h = browser();
  h.respond(schedule([event('A', 'Alex', -30, 10 + 1 / 60), event('A', 'Taylor', 11, 60)]));
  assertGreeting(h, 'Alex');
  assertNext(h, 'a');
  assertGuestAbsent(h, 'Taylor');
  h.advance(1020);
  assertGreeting(h, 'Alex');
  assertNext(h, 'a', 'Taylor');
  assert.equal(h.requests(), 1);
});

test('a cached future session becomes active at its boundary without waiting for the next poll', () => {
  const h = browser();
  h.respond(schedule([event('A', 'Alex', -30, 1 / 60), event('A', 'Taylor', 1 / 60, 2 / 60), event('B', 'Jordan', -10, 90)]));
  assertGreeting(h, 'Alex');
  assertNext(h, 'a', 'Taylor');
  assert.ok(Number(h.elements.aProgress.getAttribute('value')) < 1);
  h.advance(999);
  assertGreeting(h, 'Alex');
  h.advance(21);
  assertGreeting(h, 'Taylor');
  assertNext(h, 'a');
  assert.ok(Number(h.elements.aProgress.getAttribute('value')) > 95, 'The next session starts with its own full duration');
  assert.equal(h.text('aTimerLabel'), 'Time remaining');
  assertGuestAbsent(h, 'Jordan');
  assert.equal(h.requests(), 1);
  h.advance(1000);
  assert.equal(h.elements.sessionBoard.hidden, true);
  assert.equal(h.elements.idleWelcome.hidden, false);
  assertGreeting(h);
  assertNext(h, 'a');
  assertProgress(h, 'a');
});

test('JSONP timeout backs off, recovers, and removes callbacks and script nodes', () => {
  const h = browser();
  h.advance(15000);
  assert.equal(h.pending(), 0);
  assert.deepEqual(h.callbackNames(), []);
  assert.equal(h.text('connectionStatus'), 'Schedule temporarily unavailable');
  h.advance(19999);
  assert.equal(h.requests(), 1);
  h.advance(1);
  assert.equal(h.requests(), 2);
  h.respond(schedule([event('A', 'Alex', -30, 60)]));
  assert.equal(h.text('connectionStatus'), 'Schedule synced');
  assert.equal(h.pending(), 0);
  assert.deepEqual(h.callbackNames(), []);
  h.advance(10000);
  assert.equal(h.requests(), 3, 'A successful recovery restores the regular polling interval');
});

test('invalid responses retain the previous schedule and mark it as reconnecting', () => {
  const h = browser();
  h.respond(schedule([event('A', 'Alex', -30, 60)]));
  const saved = h.storage.get(CACHE_KEY);
  h.advance(10000);
  h.respond(schedule([event('B', 'Malformed', 20, 10)]));
  assertGreeting(h, 'Alex');
  assert.equal(h.elements.sessionBoard.hidden, false);
  assert.equal(h.storage.get(CACHE_KEY), saved);
  assert.match(h.text('connectionStatus'), /Reconnecting/);
});

test('recent cached sessions survive a restart but disappear once the five-minute grace expires', () => {
  for (const display of displays) {
    const h = browser({ search: display.search, saved: cached([
      event(display.studio, 'SelectedGuest', -30, 7), event(display.studio, 'NextGuest', 10, 60),
      event(display.opposite, 'OtherGuest', -30, 60),
      event(null, 'UnknownGuest', -30, 60)], NOW - 299000) });
    assertRoomIdentity(h, display);
    assertGreeting(h, 'SelectedGuest');
    assertNext(h, display.prefix, 'NextGuest');
    assertProgress(h, display.prefix, 18.92);
    assertGuestAbsent(h, 'OtherGuest', 'UnknownGuest');
    assert.equal(h.elements.sessionBoard.hidden, false);
    assert.match(h.text('connectionStatus'), /Reconnecting/);
    h.advance(2020);
    assertRoomIdentity(h, display);
    assert.equal(h.elements.sessionBoard.hidden, true);
    assert.equal(h.elements.idleWelcome.hidden, false);
    assertGreeting(h);
    assertNext(h, display.prefix);
    assertProgress(h, display.prefix);
    const expired = browser({ search: display.search,
      saved: cached([event(display.studio, 'OldGuest', -30, 60)], NOW - 300001) });
    assertRoomIdentity(expired, display);
    assert.equal(expired.elements.sessionBoard.hidden, true);
    assertGreeting(expired);
    assertNext(expired, display.prefix);
    assertProgress(expired, display.prefix);
    assertGuestAbsent(expired, 'OldGuest');
  }
});

test('legacy cached next bookings retain their countdown only when assigned to the selected room', () => {
  for (const display of displays) {
    const next = studio => ({ studio, firstName: 'Taylor', startISO: new Date(NOW + 60000).toISOString() });
    const h = browser({ search: display.search, saved: cached([next(display.studio)], NOW - 1000, true) });
    assertRoomIdentity(h, display);
    assert.equal(h.elements.sessionBoard.hidden, false);
    assert.equal(h.text(`${display.prefix}TimerLabel`), 'Starts in');
    assertGreeting(h, 'Taylor');
    assertNext(h, display.prefix);
    assertProgress(h, display.prefix);
    for (const studio of [display.opposite, null]) {
      const excluded = browser({ search: display.search, saved: cached([next(studio)], NOW - 1000, true) });
      assertRoomIdentity(excluded, display);
      assert.equal(excluded.elements.sessionBoard.hidden, true);
      assert.equal(excluded.elements.idleWelcome.hidden, false);
      assertGreeting(excluded);
      assertGuestAbsent(excluded, 'Taylor');
    }
  }
});

test('preview mode makes no network requests or changes to the live cache', () => {
  for (const saved of [cached([event('A', 'RealGuest', -30, 60)]), 'malformed live cache', cached([], NOW - 600000)]) {
    const h = browser({ search: '?demo=dual', saved });
    assertGreeting(h, 'Alex');
    assertRoomIdentity(h, displays[0]);
    assertGuestAbsent(h, 'Jordan');
    assert.equal(h.requests(), 0);
    h.advance(61000);
    h.setHidden(true);
    h.setHidden(false);
    assert.equal(h.requests(), 0);
    assert.equal(h.storage.get(CACHE_KEY), saved);
    assert.deepEqual(h.storageWrites, []);
  }
});

test('hidden displays cancel pending work and resume immediately without duplicate requests', () => {
  const h = browser();
  h.respond(schedule([event('A', 'Alex', -30, 60)]));
  h.advance(10000);
  assert.equal(h.pending(), 1);
  h.setHidden(true);
  assert.equal(h.pending(), 0);
  assert.deepEqual(h.callbackNames(), []);
  assert.equal(h.timers(), 0);
  h.advance(120000);
  assert.equal(h.requests(), 2);
  h.setHidden(false);
  assert.equal(h.requests(), 3);
  assert.equal(h.pending(), 1);
  h.online(true);
  assert.equal(h.requests(), 3);
  h.respond(schedule([event('A', 'Updated', -30, 60)]));
  assertGreeting(h, 'Updated');
  assert.equal(h.text('connectionStatus'), 'Schedule synced');
});

test('idle and legacy feeds never substitute an opposite or unassigned booking for the selected room', () => {
  for (const display of displays) {
    for (const payload of [schedule([event(display.opposite, 'OtherGuest', -30, 60), event(null, 'UnknownGuest', -10, 90)]),
      { isLive: true, title: `OtherGuest: Studio ${display.opposite} Rental`, ...event(undefined, undefined, -30, 60) },
      { isLive: true, title: 'UnknownGuest: Studio Rental', ...event(undefined, undefined, -30, 60) },
      schedule([])]) {
      const h = browser({ search: display.search });
      h.respond(payload);
      assertRoomIdentity(h, display);
      assert.equal(h.elements.sessionBoard.hidden, true);
      assert.equal(h.elements.idleWelcome.hidden, false);
      assertGreeting(h);
      assertNext(h, display.prefix);
      assertProgress(h, display.prefix);
      assertGuestAbsent(h, 'OtherGuest', 'UnknownGuest');
    }
    const selected = browser({ search: display.search });
    selected.respond({ isLive: true, title: `SelectedGuest: Studio ${display.studio} Rental`,
      ...event(undefined, undefined, -30, 60) });
    assertRoomIdentity(selected, display);
    assert.equal(selected.elements.sessionBoard.hidden, false);
    assertGreeting(selected, 'SelectedGuest');
  }
});
