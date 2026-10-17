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
    return { legacy, events: [...new Map(events.map(event => [event.key, event])).values()].sort((a, b) => a.startMs - b.startMs) };
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
    return { legacy: cached.legacy, events: events.sort((a, b) => a.startMs - b.startMs) };
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
  return { TIME_ZONE, firstName, roomFromTitle, normalizeFeed, restoreFeed, sessionState, countdown, timeRange, upcomingTime };
});
