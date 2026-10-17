const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const code = fs.readFileSync(path.join(__dirname, "../_apps-script/Code.js"), "utf8");
const NOW = "2026-10-17T22:00:00.000Z"; // 6 PM Eastern

function rental({ id = "private-event-id", title = "Taylor PrivateSurname: Studio A Rental",
  description = "Name: Taylor PrivateSurname\nPhone: PRIVATE_PHONE\nEmail: PRIVATE_EMAIL\nPrice: $999\nCalendar: Smooth Studios",
  start = "2026-10-17T21:30:00Z", end = "2026-10-17T23:00:00Z", allDay = false } = {}) {
  return { getId: () => id, getTitle: () => title, getDescription: () => description,
    getStartTime: () => new Date(start), getEndTime: () => new Date(end), isAllDayEvent: () => allDay };
}

function harness({ events = [], properties = {}, missing = false, ambiguous = false, throwCalendar = false,
  now = NOW, calendarsById = {}, brokenCache = false } = {}) {
  let instant = Date.parse(now);
  let reads = 0;
  let cached = null;
  const windows = [];
  const calendar = { getEvents(from, until) {
    reads++;
    if (throwCalendar) throw new Error("PRIVATE_CALENDAR_ID access denied");
    windows.push([from.toISOString(), until.toISOString()]);
    return events.filter(e => e.getStartTime() < until && e.getEndTime() > from);
  } };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant; }
  }
  const context = vm.createContext({
    Date: ClockDate,
    CalendarApp: {
      getCalendarsByName(name) { assert.equal(name, "Smooth Studios"); return missing ? [] : ambiguous ? [calendar, calendar] : [calendar]; },
      getCalendarById(id) { return calendarsById[id] || null; },
      getDefaultCalendar() { throw new Error("Must never fall back to personal calendar"); }
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] || null }) },
    CacheService: { getScriptCache() {
      if (brokenCache) throw new Error("Cache down");
      return { get: () => cached, put(_key, value, ttl) { assert.equal(ttl, 15); cached = value; } };
    } },
    Utilities: { formatDate(value, zone, format) {
      assert.equal(zone, "America/New_York");
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit",
        day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(value).map(p => [p.type, p.value]));
      if (format === "yyyy-MM-dd") return parts.year + "-" + parts.month + "-" + parts.day;
      assert.equal(format, "Z");
      const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
      const offset = Math.round((local - value.getTime()) / 60000);
      return (offset < 0 ? "-" : "+") + String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0") + String(Math.abs(offset) % 60).padStart(2, "0");
    } },
    ContentService: { MimeType: { JAVASCRIPT: "js", JSON: "json" },
      createTextOutput(text) { return { text, setMimeType(type) { this.type = type; return this; } }; } }
  });
  vm.runInContext(code, context);
  return { context, windows, read: () => JSON.parse(context.doGet({ parameter: {} }).text),
    reads: () => reads, advance: ms => { instant += ms; } };
}

test("returns both concurrent studios and tomorrow, with only first names and times", () => {
  const h = harness({ events: [
    rental(),
    rental({ id: "private-b", title: "Jordan HiddenSurname: quick studio b rental", description: "",
      start: "2026-10-17T21:45:00Z", end: "2026-10-17T23:30:00Z" }),
    rental({ id: "private-tomorrow", title: "Sam HiddenSurname: Studio Rental", description: "Studio:\nB",
      start: "2026-10-18T20:00:00Z", end: "2026-10-18T21:00:00Z" }),
  ] });
  const feed = h.read();
  assert.equal(feed.schemaVersion, 2);
  assert.equal(feed.ok, true);
  assert.equal(feed.events.length, 3);
  assert.deepEqual(feed.events.map(e => [e.firstName, e.studio]), [["Taylor", "A"], ["Jordan", "B"], ["Sam", "B"]]);
  for (const event of feed.events) assert.deepEqual(Object.keys(event).sort(), ["endISO", "firstName", "startISO", "studio"]);
  assert.equal(feed.isLive, true);
  assert.equal(feed.title, "Taylor: Studio Rental");
  assert.equal(feed.nextTitle, "Sam: Studio Rental");
  assert.equal(feed.timeZone, "America/New_York");
  assert.equal(feed.generatedAt, NOW);
  assert.doesNotMatch(JSON.stringify(feed), /PrivateSurname|HiddenSurname|private-|PRIVATE_|999|Phone|Email/);
  assert.deepEqual(h.windows, [["2026-10-17T04:00:00.000Z", "2026-10-19T04:00:00.000Z"]]);
});

test("excludes ended, cancelled, all-day, invalid, unrelated and outside-window events", () => {
  const h = harness({ events: [
    rental({ id: "done", end: NOW }),
    rental({ id: "canceled", title: "Canceled: Studio A Rental" }),
    rental({ id: "cancelled", title: "Client: Studio Rental [CANCELLED]" }),
    rental({ id: "all-day", allDay: true }),
    rental({ id: "backwards", start: "2026-10-17T23:45:00Z" }),
    rental({ id: "unrelated", title: "Other: Portrait Photography" }),
    rental({ id: "outside", start: "2026-10-19T04:00:00Z", end: "2026-10-19T05:00:00Z" }),
  ] });
  const feed = h.read();
  assert.deepEqual(feed.events, []);
  assert.equal(feed.ok, true);
  assert.equal(feed.isLive, false);
  assert.equal(feed.title, null);
});

test("resolves explicit room fields and preserves unknown or conflicting bookings", () => {
  const h = harness();
  const studio = h.context.tvStudio;
  assert.equal(studio("Name: Quick Studio Rental", "Studio A Rental Form\nBackdrop colors: Blue", null), "A");
  assert.equal(studio("Name: Studio Rental", "Calendar: Studio B", null), "B");
  assert.equal(studio("Name: Rental A", "", null), "A");
  assert.equal(studio("Name: Studio Rental", "Which studio are you renting?:\nStudio B", null), "B");
  assert.equal(studio("Name: Studio Rental", "Notes: Last time I used Studio A\nBackdrop colors: Studio B", null), null);
  assert.equal(studio("Name: Studio Rental", "Calendar: Smooth Studios", null), null);
  assert.equal(studio("Name: Studio A Rental", "Room: B", null), null);
  assert.equal(studio("Name: Studio A & B Rental", "", null), null);
});

test("keeps an overnight active session and uses Eastern midnight across both DST changes", () => {
  const h = harness({ now: "2026-11-01T05:30:00Z", events: [
    rental({ start: "2026-11-01T03:00:00Z", end: "2026-11-01T08:00:00Z" }),
  ] });
  assert.equal(h.read().events.length, 1);
  assert.deepEqual(h.windows[0], ["2026-11-01T04:00:00.000Z", "2026-11-03T05:00:00.000Z"]);
  const spring = harness({ now: "2026-03-08T07:30:00Z" });
  spring.read();
  assert.deepEqual(spring.windows[0], ["2026-03-08T05:00:00.000Z", "2026-03-10T04:00:00.000Z"]);
});

test("configured room calendars support separate sources and deduplicate events", () => {
  const sourceA = { getEvents: () => [rental({ title: "Client: Studio Rental", description: "" })] };
  const sourceB = { getEvents: () => [rental({ id: "second", title: "Client: Studio Rental", description: "" })] };
  const h = harness({ properties: { CALENDAR_IDS: "A-ID", STUDIO_A_CALENDAR_ID: "A-ID", STUDIO_B_CALENDAR_ID: "B-ID" },
    calendarsById: { "A-ID": sourceA, "B-ID": sourceB } });
  assert.deepEqual(h.read().events.map(e => e.studio), ["A", "B"]);
  const duplicate = harness({ events: [rental(), rental()] });
  assert.equal(duplicate.read().events.length, 1);
});

test("missing/ambiguous/unreadable calendars are errors, distinct from a successful empty feed", () => {
  for (const options of [{ missing: true }, { ambiguous: true }, { throwCalendar: true },
    { properties: { STUDIO_A_CALENDAR_ID: "unknown" } },
    { properties: { STUDIO_A_CALENDAR_ID: "same", STUDIO_B_CALENDAR_ID: "same" } }]) {
    const feed = harness(options).read();
    assert.equal(feed.ok, false);
    assert.ok(feed.error.code);
    assert.equal(feed.events, undefined);
    assert.equal(feed.isLive, undefined);
    assert.doesNotMatch(JSON.stringify(feed), /PRIVATE_CALENDAR_ID|unknown|same/);
  }
});

test("JSONP callback validation rejects executable expressions and preserves safe callbacks", () => {
  const h = harness({ events: [rental()] });
  const good = h.context.doGet({ parameter: { callback: "handleSmoothFeed_123" } });
  assert.equal(good.type, "js");
  assert.match(good.text, /^handleSmoothFeed_123\(\{/);
  for (const callback of ["alert(1)", "foo.bar", "foo;alert(1)//", "x".repeat(65)]) {
    const bad = h.context.doGet({ parameter: { callback } });
    assert.equal(bad.type, "json");
    assert.equal(JSON.parse(bad.text).error.code, "INVALID_CALLBACK");
  }
  const safe = h.context.tvResponse({ value: "</script>\u2028" }, "callback").text;
  assert.doesNotMatch(safe, /<\/script>/);
  assert.match(safe, /\\u003c\/script>/);
});

test("short cache reduces calendar reads, expires, and does not turn cache faults into outages", () => {
  const h = harness({ events: [rental()] });
  const first = h.read();
  h.advance(10000);
  assert.deepEqual(h.read(), first);
  assert.equal(h.reads(), 1);
  h.advance(6000);
  assert.notEqual(h.read().generatedAt, first.generatedAt);
  assert.equal(h.reads(), 2);
  assert.equal(harness({ brokenCache: true, events: [rental()] }).read().ok, true);
});

test("name extraction does not publish surnames, emails, phone numbers, or appointment labels", () => {
  const h = harness();
  const first = h.context.tvFirstName;
  assert.equal(first("Jane SecretSurname: Studio Rental", ""), "Jane");
  assert.equal(first("Studio Rental", ""), "");
  assert.equal(first("Studio Rental", "Name:\nMary-Jane SecretSurname"), "Mary-Jane");
  assert.equal(first("Studio Rental", "Name: email@example.com"), "");
  assert.equal(first("Studio Rental", "Name: 202-555-0123"), "");
});

