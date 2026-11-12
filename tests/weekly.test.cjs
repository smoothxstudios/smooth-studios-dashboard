const test = require('node:test');
const assert = require('node:assert/strict');
const Feed = require('../feed-model.js');
const at = value => Date.parse(value);
const event = (studio, startISO, endISO) => Feed.normalizeFeed({schemaVersion:2,events:[{studio,firstName:'Guest',startISO,endISO}]}).events[0];
const bookings = [event('A','2026-11-12T12:00:00-05:00','2026-11-12T13:00:00-05:00'),event('B','2026-11-12T19:00:00-05:00','2026-11-12T19:30:00-05:00'),event('A','2026-11-13T12:00:00-05:00','2026-11-13T13:00:00-05:00')];
test('weekly mode begins exactly at final end, survives midnight, and ends exactly one hour before next booking',()=>{
  for(const [time,mode] of [['2026-11-12T19:29:59-05:00','welcome'],['2026-11-12T19:30:00-05:00','calendar'],['2026-11-13T00:00:00-05:00','calendar'],['2026-11-13T10:59:59-05:00','calendar'],['2026-11-13T11:00:00-05:00','welcome'],['2026-11-13T12:00:00-05:00','welcome'],['2026-11-13T13:00:00-05:00','calendar']]) assert.equal(Feed.displayState(bookings,at(time)).mode,mode,time);
});
test('gaps between same-day appointments keep welcome view; no rentals means calendar',()=>{
  assert.equal(Feed.displayState(bookings,at('2026-11-12T15:00:00-05:00')).mode,'welcome');
  assert.equal(Feed.displayState(bookings,at('2026-11-14T12:00:00-05:00')).mode,'calendar');
  assert.equal(Feed.displayState([],at('2026-11-14T12:00:00-05:00')).mode,'calendar');
});
test('both studios determine last appointment and next booking; unknown rooms do not affect screen',()=>{
  const state=Feed.displayState([...bookings,event(null,'2026-11-12T23:00:00-05:00','2026-11-13T00:00:00-05:00')],at('2026-11-12T20:00:00-05:00'));
  assert.equal(state.mode,'calendar');assert.equal(state.next.studio,'A');assert.equal(state.returnAt,at('2026-11-13T11:00:00-05:00'));
});
test('overnight bookings and preparation before midnight do not briefly show the calendar',()=>{
  const events=[event('B','2026-11-13T00:30:00-05:00','2026-11-13T02:00:00-05:00')];
  assert.equal(Feed.displayState(events,at('2026-11-12T23:29:59-05:00')).mode,'calendar');
  assert.equal(Feed.displayState(events,at('2026-11-12T23:30:00-05:00')).mode,'welcome');
  assert.equal(Feed.displayState(events,at('2026-11-13T01:00:00-05:00')).mode,'welcome');
  assert.equal(Feed.displayState(events,at('2026-11-13T02:00:00-05:00')).mode,'calendar');
});
test('weeks are Monday–Sunday Eastern, not UTC, and roll over on Monday',()=>{
  assert.equal(Feed.weekDays(at('2026-11-16T04:59:59Z'))[0].date,'2026-11-09');
  assert.equal(Feed.weekDays(at('2026-11-16T05:00:00Z'))[0].date,'2026-11-16');
  assert.deepEqual(Feed.weekDays(at('2026-11-12T20:00:00-05:00')).map(d=>d.date),['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14','2026-11-15']);
});
test('DST changes use civil-day boundaries and exactly one elapsed hour for preparation',()=>{
  const fall=Feed.weekDays(at('2026-11-01T12:00:00Z'))[6];
  const spring=Feed.weekDays(at('2026-03-08T12:00:00Z'))[6];
  assert.equal(fall.endMs-fall.startMs,25*3600000);
  assert.equal(spring.endMs-spring.startMs,23*3600000);
  const events=[event('A','2026-11-01T01:30:00-05:00','2026-11-01T02:30:00-05:00')];
  assert.equal(Feed.displayState(events,at('2026-11-01T01:29:59-04:00')).mode,'calendar');
  assert.equal(Feed.displayState(events,at('2026-11-01T01:30:00-04:00')).mode,'welcome');
});
test('calendar requires complete weekly coverage, including after a cache restore',()=>{
  const now=at('2026-11-12T20:00:00-05:00');
  const full=Feed.normalizeFeed({schemaVersion:2,events:[],rangeStartISO:'2026-11-09T00:00:00-05:00',rangeEndISO:'2026-11-23T00:00:00-05:00'});
  assert.equal(Feed.hasWeekCoverage(full,now),true);
  assert.equal(Feed.hasWeekCoverage(Feed.restoreFeed(full),now),true);
  assert.equal(Feed.hasWeekCoverage(Feed.normalizeFeed({schemaVersion:2,events:[]}),now),false);
  assert.equal(Feed.hasWeekCoverage(full,at('2026-11-23T00:00:00-05:00')),false);
});
