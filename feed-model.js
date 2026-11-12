(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmoothFeed = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TIME_ZONE = 'America/New_York';
  const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });
  const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, month: 'short', day: 'numeric' });

  function firstName(value) {
    if (typeof value !== 'string') return 'Guest';
    const name = value.split(':')[0].trim().split(/\s+/)[0];
    return !name || /^(studio|quick|rental|appointment)$/i.test(name) ? 'Guest' : name.slice(0, 40);
  }
  function roomFromTitle(title) {
    const matches = [...String(title || '').matchAll(/\bstudio\s*([ab])\b/gi)].map(match => match[1].toUpperCase());
    const rooms = [...new Set(matches)];
    return rooms.length === 1 ? rooms[0] : null;
  }
  function eventOf(raw, partial = false) {
    if (!raw || typeof raw !== 'object') return null;
    const startMs = Date.parse(raw.startISO);
    const endMs = Date.parse(raw.endISO);
    if (!Number.isFinite(startMs) || (!partial && (!Number.isFinite(endMs) || endMs <= startMs))) return null;
    return {
      firstName: firstName(raw.firstName || raw.title),
      studio: ['A', 'B'].includes(raw.studio) ? raw.studio : null,
      startMs, endMs: Number.isFinite(endMs) ? endMs : null,
      key: [raw.studio || '', startMs, endMs || '', firstName(raw.firstName || raw.title)].join('|')
    };
  }
  function normalizeFeed(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.ok === false || data.error) throw new Error('Schedule unavailable');
    let events;
    const legacy = data.schemaVersion !== 2;
    if (!legacy) {
      if (!Array.isArray(data.events)) throw new Error('Invalid schedule');
      events = data.events.map(raw => eventOf(raw));
      if (events.some(event => !event)) throw new Error('Incomplete schedule');
    } else {
      if (typeof data.isLive !== 'boolean') throw new Error('Invalid schedule');
      events = [];
      if (data.isLive) {
        const current = eventOf({ ...data, studio: roomFromTitle(data.title) });
        if (!current) throw new Error('Invalid current session');
        events.push(current);
      }
      if (data.nextStartISO && data.nextTitle) {
        const next = eventOf({ firstName: firstName(data.nextTitle), startISO: data.nextStartISO, endISO: data.nextEndISO, studio: roomFromTitle(data.nextTitle) }, !data.nextEndISO);
        if (next) events.push(next);
      }
    }
    const rangeStartMs = Date.parse(data.rangeStartISO);
    const rangeEndMs = Date.parse(data.rangeEndISO);
    return { legacy, rangeStartMs: Number.isFinite(rangeStartMs) ? rangeStartMs : null,
      rangeEndMs: Number.isFinite(rangeEndMs) ? rangeEndMs : null,
      events: [...new Map(events.map(event => [event.key, event])).values()].sort((a, b) => a.startMs - b.startMs) };
  }
  function sessionState(events, now) {
    const active = events.filter(event => event.startMs <= now && event.endMs > now);
    const current = active.slice().sort((a, b) => a.endMs - b.endMs)[0] || null;
    const next = events.find(event => event.startMs > now) || null;
    return { active, current, next, phase: current ? 'active' : next ? 'upcoming' : 'idle' };
  }
  function restoreFeed(cached) {
    if (!cached || !Array.isArray(cached.events) || typeof cached.legacy !== 'boolean') throw new Error('Invalid cached schedule');
    const events = cached.events.map(event => eventOf({ firstName: event.firstName, studio: event.studio,
      startISO: new Date(event.startMs).toISOString(),
      endISO: event.endMs === null ? null : new Date(event.endMs).toISOString()
    }, cached.legacy && event.endMs === null));
    if (events.some(event => !event)) throw new Error('Invalid cached session');
    return { legacy: cached.legacy,
      rangeStartMs: Number.isFinite(cached.rangeStartMs) ? cached.rangeStartMs : null,
      rangeEndMs: Number.isFinite(cached.rangeEndMs) ? cached.rangeEndMs : null,
      events: events.sort((a, b) => a.startMs - b.startMs) };
  }
  function countdown(end, now) {
    const total = Math.max(0, Math.ceil((end - now) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, '0');
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
  }
  function timeRange(event) {
    return `${timeFormat.format(event.startMs)}${event.endMs ? ` – ${timeFormat.format(event.endMs)}` : ''}`;
  }
  function upcomingTime(event, now) {
    const prefix = dayFormat.format(event.startMs) === dayFormat.format(now) ? '' : `${dateFormat.format(event.startMs)} · `;
    return `${prefix}${timeFormat.format(event.startMs)}`;
  }
  function localDate(instant) {
    const parts = Object.fromEntries(dayFormat.formatToParts(instant).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function shiftDate(date, days) {
    return new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
  }
  function midnight(date) {
    const wall = Date.parse(date + 'T00:00:00Z');
    const format = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    let instant = wall;
    for (let i = 0; i < 4; i++) {
      const p = Object.fromEntries(format.formatToParts(instant).map(p => [p.type, p.value]));
      const offset = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - instant;
      const next = wall - offset;
      if (next === instant) break;
      instant = next;
    }
    return instant;
  }
  function weekDays(now) {
    const today = localDate(now);
    const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
    const monday = shiftDate(today, -((weekday + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const date = shiftDate(monday, i);
      return { date, startMs: midnight(date), endMs: midnight(shiftDate(date, 1)), today: date === today };
    });
  }
  function hasWeekCoverage(feed, now) {
    const days = weekDays(now);
    return !feed.legacy && Number.isFinite(feed.rangeStartMs) && Number.isFinite(feed.rangeEndMs) &&
      feed.rangeStartMs <= days[0].startMs && feed.rangeEndMs >= days[6].endMs;
  }
  function displayState(events, now) {
    const known = events.filter(e => ['A', 'B'].includes(e.studio) && e.endMs > e.startMs);
    const next = known.filter(e => e.startMs > now).sort((a, b) => a.startMs - b.startMs)[0] || null;
    const today = localDate(now);
    const start = midnight(today), end = midnight(shiftDate(today, 1));
    const todayEvents = known.filter(e => e.startMs < end && e.endMs > start);
    const firstStart = Math.min(...todayEvents.map(e => e.startMs));
    const lastEnd = Math.max(...todayEvents.map(e => e.endMs));
    // Keep the welcome view between same-day sessions. Empty days and the
    // overnight gap stay on the calendar, including after a kiosk restart.
    const inBookingDay = todayEvents.length > 0 && now >= firstStart - 3600000 && now < lastEnd;
    const preparingNext = Boolean(next && now >= next.startMs - 3600000);
    return { mode: inBookingDay || preparingNext ? 'welcome' : 'calendar', next,
      returnAt: next ? next.startMs - 3600000 : null };
  }
  function relativeTime(instant, now) {
    const date = localDate(instant), today = localDate(now);
    const label = date === today ? 'Today' : date === shiftDate(today, 1) ? 'Tomorrow' : dateFormat.format(instant);
    return `${label} · ${timeFormat.format(instant)}`;
  }
  function calendarTime(event, day) {
    const start = Math.max(event.startMs, day.startMs), end = Math.min(event.endMs, day.endMs);
    let startText = timeFormat.format(start).replace(':00', '');
    const endText = timeFormat.format(end).replace(':00', '');
    if (event.startMs < day.startMs) return `From Previous Day – ${event.endMs >= day.endMs ? 'Midnight' : endText}`;
    if (event.endMs >= day.endMs) return `${startText} – Midnight`;
    if (startText.slice(-2) === endText.slice(-2)) startText = startText.slice(0, -3);
    return `${startText}–${endText}`;
  }
  return { TIME_ZONE, firstName, roomFromTitle, normalizeFeed, restoreFeed, sessionState, countdown, timeRange, upcomingTime,
    localDate, shiftDate, midnight, weekDays, hasWeekCoverage, displayState, relativeTime, calendarTime };
});

