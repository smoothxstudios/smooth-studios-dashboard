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

test('the actual HTML entry point boots its dependencies in order', () => {
  const h = browser({ fromHTML: true });
  assert.equal(h.pending(), 1);
  assert.equal(h.text('connectionStatus'), 'Connecting to schedule');
});

test('initial load is welcoming while a single request waits; no premature empty-room claim', () => {
  const h = browser();
  assert.equal(h.elements.sessionBoard.hidden, true);
  assert.equal(h.elements.idleWelcome.hidden, false);
  assert.equal(h.text('connectionStatus'), 'Connecting to schedule');
  assert.equal(h.pending(), 1);
  h.advance(14000);
  assert.equal(h.requests(), 1);
  assert.equal(h.pending(), 1);
});

test('concurrent rooms display independent guests, countdowns, and upcoming-row labels', () => {
  const h = browser();
  h.respond(schedule([event('A', 'Alex', -30, 7), event('B', 'Jordan', -10, 90), event('A', 'Taylor', 10, 60)]));
  assert.equal(h.elements.sessionBoard.hidden, false);
  assert.equal(h.elements.studioA.hidden, false);
  assert.equal(h.elements.studioB.hidden, false);
  assert.equal(h.text('aName'), 'Alex');
  assert.equal(h.text('bName'), 'Jordan');
  assert.equal(h.text('aTimer'), '7:00');
  assert.equal(h.text('bTimer'), '1:30:00');
  assert.equal(h.elements.studioA.getAttribute('data-urgent'), 'true');
  assert.equal(h.elements.studioB.getAttribute('data-urgent'), 'false');
  assert.equal(h.text('aNextLabel'), 'Up next');
  assert.match(h.text('aNext'), /Taylor/);
  assert.notEqual(h.text('bNextLabel'), 'Up next', 'Courtesy text must not be presented as the next booking');
});

test('a cached future session becomes active at its boundary without waiting for the next poll', () => {
  const h = browser();
  h.respond(schedule([event('A', 'Alex', -30, 1 / 60), event('A', 'Taylor', 1 / 60, 60), event('B', 'Jordan', -10, 90)]));
  assert.equal(h.text('aName'), 'Alex');
  h.advance(1020);
  assert.equal(h.text('aName'), 'Taylor');
  assert.equal(h.text('aTimerLabel'), 'Time remaining');
  assert.equal(h.text('bName'), 'Jordan');
  assert.equal(h.requests(), 1);
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
  assert.equal(h.text('aName'), 'Alex');
  assert.equal(h.elements.sessionBoard.hidden, false);
  assert.equal(h.storage.get(CACHE_KEY), saved);
  assert.match(h.text('connectionStatus'), /Reconnecting/);
});

test('recent cached sessions survive a restart but disappear once the five-minute grace expires', () => {
  const h = browser({ saved: cached([event('A', 'Alex', -30, 60)], NOW - 299000) });
  assert.equal(h.text('aName'), 'Alex');
  assert.equal(h.elements.sessionBoard.hidden, false);
  assert.match(h.text('connectionStatus'), /Reconnecting/);
  h.advance(2020);
  assert.equal(h.elements.sessionBoard.hidden, true);
  assert.equal(h.elements.idleWelcome.hidden, false);
  const expired = browser({ saved: cached([event('A', 'OldGuest', -30, 60)], NOW - 300001) });
  assert.equal(expired.elements.sessionBoard.hidden, true);
  assert.notEqual(expired.text('aName'), 'OldGuest');
});

test('legacy next bookings without a published end time survive cache restoration', () => {
  const next = { studio: null, firstName: 'Taylor', startISO: new Date(NOW + 60000).toISOString() };
  const h = browser({ saved: cached([next], NOW - 1000, true) });
  assert.equal(h.elements.sessionBoard.hidden, false);
  assert.equal(h.text('unassignedName'), 'Taylor');
  assert.equal(h.text('unassignedTimerLabel'), 'Starts in');
  assert.equal(h.elements.studioA.hidden, true);
  assert.equal(h.elements.studioB.hidden, true);
});

test('preview mode makes no network requests or changes to the live cache', () => {
  for (const saved of [cached([event('A', 'RealGuest', -30, 60)]), 'malformed live cache', cached([], NOW - 600000)]) {
    const h = browser({ search: '?demo=dual', saved });
    assert.equal(h.text('aName'), 'Alex');
    assert.equal(h.text('bName'), 'Jordan');
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
  assert.equal(h.text('aName'), 'Updated');
  assert.equal(h.text('connectionStatus'), 'Schedule synced');
});

test('room-specific displays do not show the other studio or unassigned sessions', () => {
  const h = browser({ search: '?studio=b' });
  h.respond(schedule([event('A', 'PrivateA', -30, 60), event('B', 'Jordan', -10, 90), event(null, 'UnknownRoom', -10, 90)]));
  assert.equal(h.elements.studioA.hidden, true);
  assert.equal(h.elements.studioB.hidden, false);
  assert.equal(h.elements.studioUnassigned.hidden, true);
  assert.equal(h.text('bName'), 'Jordan');
  assert.equal(h.elements.roomGrid.getAttribute('data-layout'), 'single');
});
