const { test } = require('node:test');
const assert = require('node:assert/strict');
const Feed = require('../feed-model.js');
const now = Date.parse('2026-10-17T18:00:00-04:00');
const event = (studio, name, start, end) => ({ studio, firstName: name, startISO: new Date(now + start * 60000).toISOString(), endISO: new Date(now + end * 60000).toISOString() });
test('simultaneous A and B sessions remain independent and switch at the exact boundary', () => {
  const { events } = Feed.normalizeFeed({ schemaVersion: 2, events: [event('A', 'Alex', -30, 60), event('B', 'Jordan', -10, 20), event('B', 'Taylor', 20, 80)] });
  assert.equal(Feed.sessionState(events.filter(e => e.studio === 'A'), now).current.firstName, 'Alex');
  assert.equal(Feed.sessionState(events.filter(e => e.studio === 'B'), now).current.firstName, 'Jordan');
  assert.equal(Feed.sessionState(events.filter(e => e.studio === 'B'), now + 20 * 60000).current.firstName, 'Taylor');
});
test('hour-long timers never wrap back to zero', () => {
  assert.equal(Feed.countdown(now + 90 * 60000, now), '1:30:00');
  assert.equal(Feed.countdown(now + 60 * 60000, now), '1:00:00');
  assert.equal(Feed.countdown(now + 599000, now), '9:59');
  assert.equal(Feed.countdown(now - 100, now), '0:00');
});
test('legacy feed preserves unknown room and never invents an end time', () => {
  const data = Feed.normalizeFeed({ isLive: true, title: 'Alex Smith: Studio Rental', startISO: new Date(now - 60000).toISOString(), endISO: new Date(now + 60000).toISOString(), nextTitle: 'Taylor: Studio B Rental', nextStartISO: new Date(now + 120000).toISOString() });
  assert.equal(data.legacy, true);
  assert.equal(data.events[0].studio, null);
  assert.equal(data.events[0].firstName, 'Alex');
  assert.equal(data.events[1].studio, 'B');
  assert.equal(Feed.sessionState(data.events, now + 120000).current, null);
});
test('invalid feeds do not masquerade as an empty schedule', () => {
  for (const bad of [null, {}, [], { ok: false, events: [] }, { schemaVersion: 2, events: [event('A', 'Alex', 10, 5)] }]) assert.throws(() => Feed.normalizeFeed(bad));
  assert.deepEqual(Feed.normalizeFeed({ schemaVersion: 2, events: [] }).events, []);
});
test('overlapping same-room bookings remain visible', () => {
  const { events } = Feed.normalizeFeed({ schemaVersion: 2, events: [event('A', 'Alex', -30, 20), event('A', 'Taylor', -10, 10)] });
  assert.equal(Feed.sessionState(events, now).active.length, 2);
  assert.equal(Feed.sessionState(events, now).current.firstName, 'Taylor');
});
test('Eastern time is independent of kiosk timezone', () => {
  const e = Feed.normalizeFeed({ schemaVersion: 2, events: [event('A', 'Alex', 0, 60)] }).events[0];
  assert.equal(Feed.timeRange(e), '6:00 PM – 7:00 PM');
  assert.equal(Feed.upcomingTime(e, now), '6:00 PM');
});
