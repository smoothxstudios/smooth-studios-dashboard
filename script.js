/* Smooth Studios Welcome TV — no framework, no full-page refreshes. */
(function () {
  'use strict';
  const Feed = window.SmoothFeed;
  const FEED_URL = 'https://script.google.com/macros/s/AKfycbyCW9D8uiFxeQMb5P4EDpnl-oIzwq7dIId-K91oXMUlC4nDPSvnTMtqFj03ZJ7vlsK6sA/exec';
  const POLL_MS = 10000;
  const REQUEST_TIMEOUT_MS = 15000;
  const STALE_MS = 60000;
  const EXPIRE_MS = 300000;
  const CACHE_KEY = 'smooth-welcome-tv-v3';
  const params = new URLSearchParams(location.search);
  // The existing kiosk lives in Studio A. Studio B has its own ?studio=B URL.
  const roomFilter = (params.get('studio') || '').toUpperCase() === 'B' ? 'B' : 'A';
  const demo = ['dual', 'urgent', 'idle', 'offline', 'weekly', 'welcome', 'busy'].includes(params.get('demo')) ? params.get('demo') : null;
  const demoStartedAt = Date.now();
  const demoEpoch = ['weekly', 'busy'].includes(demo) ? Date.parse('2026-11-12T20:00:00-05:00') : demo === 'welcome' ? Date.parse('2026-11-12T18:30:00-05:00') : null;
  const displayNow = () => demoEpoch === null ? Date.now() : demoEpoch + Date.now() - demoStartedAt;
  const el = {};
  document.querySelectorAll('[id]').forEach(node => { el[node.id] = node; });
  const roomPrefix = roomFilter.toLowerCase();
  const roomPanel = el[`studio${roomFilter}`];
  document.title = `Studio ${roomFilter} | Smooth Studios`;
  attr(document.body, 'data-studio', roomFilter);
  hidden(el.studioA, roomFilter !== 'A');
  hidden(el.studioB, roomFilter !== 'B');
  hidden(el.previewLabel, !demo);
  const clockFormat = new Intl.DateTimeFormat('en-US', { timeZone: Feed.TIME_ZONE, hour: 'numeric', minute: '2-digit' });
  const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: Feed.TIME_ZONE, weekday: 'long', month: 'long', day: 'numeric' });
  let feed = null;
  let lastSuccess = 0;
  let lastAttemptFailed = false;
  let failureCount = 0;
  let request = null;
  let pollTimer = null;
  let tickTimer = null;
  let sequence = 0;
  let lastClockMinute = -1;
  let lastCalendarSignature = '';

  function text(node, value) { if (node && node.textContent !== value) node.textContent = value; }
  function hidden(node, value) { if (node && node.hidden !== value) node.hidden = value; }
  function attr(node, key, value) { if (node && node.getAttribute(key) !== value) node.setAttribute(key, value); }
  function isExpired(now) { return !lastSuccess || (!demo && now - lastSuccess > EXPIRE_MS); }
  function countdownText(end, now) {
    const value = Feed.countdown(end, now);
    const parts = value.split(':');
    return parts.length === 3 ? `${parts[0]}h ${Number(parts[1])}m` : `${value} min`;
  }
  function renderGreeting(name = '') {
    text(el.heroStudio, 'Smooth Studios');
    text(el.heroGuest, name);
    hidden(el.heroGuest, !name);
    attr(el.heroTitle, 'data-personalized', String(Boolean(name)));
    attr(el.heroGuest, 'data-length', name.length > 22 ? 'long' : name.length > 12 ? 'medium' : 'short');
  }
  function renderNext(prefix, next = null, now = Date.now()) {
    hidden(el[`${prefix}NextRow`], !next);
    text(el[`${prefix}Next`], next ? `${next.firstName} · ${Feed.upcomingTime(next, now)}` : '');
  }
  function renderProgress(prefix, current = null, now = Date.now()) {
    const progress = el[`${prefix}Progress`];
    const remaining = current ? Math.max(0, Math.min(100, (current.endMs - now) / (current.endMs - current.startMs) * 100)) : 0;
    attr(progress, 'value', remaining.toFixed(2));
    attr(progress, 'aria-valuetext', current ? `${countdownText(current.endMs, now)} remaining` : '');
    hidden(progress, !current);
  }

  function renderRoom(prefix, panel, events, now, stale) {
    const state = Feed.sessionState(events, now);
    const current = state.current;
    const next = state.next;
    const upcoming = !current && next;
    const urgent = !!current && current.endMs - now <= 600000;
    attr(panel, 'data-state', state.phase);
    attr(panel, 'data-urgent', String(urgent));
    attr(panel, 'data-stale', String(stale));
    text(el[`${prefix}Status`], current ? (state.active.length > 1 ? 'Sessions in progress' : urgent ? 'Wrapping up' : 'In session') : upcoming ? 'Up next' : 'No session scheduled');
    const guest = current ? state.active.map(event => event.firstName).join(' & ') : upcoming ? next.firstName : '';
    renderGreeting(guest === 'Guest' ? '' : guest);
    text(el[`${prefix}TimerLabel`], current ? 'Time remaining' : upcoming ? 'Starts in' : 'Welcome to Smooth Studios');
    text(el[`${prefix}Timer`], current ? countdownText(current.endMs, now) : upcoming ? countdownText(next.startMs, now) : '—');
    renderProgress(prefix, current, now);
    text(el[`${prefix}Session`], current ? Feed.timeRange(current) : upcoming ? `${Feed.upcomingTime(next, now)}${next.endMs ? ` – ${clockFormat.format(next.endMs)}` : ''}` : 'Enjoy your time here.');
    const showNext = Boolean(current && next && urgent);
    renderNext(prefix, showNext ? next : null, now);
  }

  function element(tag, className, content = '') {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = content;
    return node;
  }
  function renderCalendar(events, state, now) {
    const days = Feed.weekDays(now);
    const page = Math.floor(now / 12000);
    const signature = [days[0].date, Feed.localDate(now), page, state.next?.key,
      ...events.map(event => event.key)].join(';');
    text(el.calendarNext, state.next ? `${Feed.relativeTime(state.next.startMs, now)} · Studio ${state.next.studio}` : 'No Upcoming Bookings');
    text(el.calendarReturn, state.returnAt ? Feed.relativeTime(state.returnAt, now) : 'One Hour Before The Next Booking');
    if (signature === lastCalendarSignature) return;
    lastCalendarSignature = signature;
    const rangeFormat = new Intl.DateTimeFormat('en-US', { timeZone: Feed.TIME_ZONE, month: 'long', day: 'numeric' });
    const year = new Intl.DateTimeFormat('en-US', { timeZone: Feed.TIME_ZONE, year: 'numeric' }).format(days[6].startMs);
    const endDate = days[0].date.slice(0, 7) === days[6].date.slice(0, 7) ? Number(days[6].date.slice(8)) : rangeFormat.format(days[6].startMs);
    text(el.weekRange, `${rangeFormat.format(days[0].startMs)}–${endDate}, ${year}`);
    el.weekGrid.replaceChildren();
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    days.forEach((day, index) => {
      const column = element('article', 'day-column');
      attr(column, 'data-today', String(day.today));
      const heading = element('h2', 'day-heading');
      heading.appendChild(element('span', 'day-name', dayNames[index]));
      heading.appendChild(element('span', 'day-number', String(Number(day.date.slice(8)))));
      column.appendChild(heading);
      const list = element('div', 'day-bookings');
      const bookings = events.filter(event => ['A', 'B'].includes(event.studio) && event.startMs < day.endMs && event.endMs > day.startMs);
      const pages = Math.ceil(bookings.length / 3);
      const activePage = pages ? page % pages : 0;
      bookings.slice(activePage * 3, (activePage + 1) * 3).forEach(event => {
        const card = element('div', 'rental-card');
        attr(card, 'data-studio', event.studio);
        if (state.next && event.key === state.next.key) card.appendChild(element('span', 'rental-badge', 'Up Next'));
        card.appendChild(element('h3', 'rental-title', `Studio ${event.studio}`));
        card.appendChild(element('p', 'rental-time', Feed.calendarTime(event, day)));
        list.appendChild(card);
      });
      if (!bookings.length) list.appendChild(element('p', 'no-rentals', 'No Rentals'));
      column.appendChild(list);
      if (pages > 1) column.appendChild(element('p', 'page-note', `${activePage + 1} / ${pages} · ${bookings.length} Rentals`));
      el.weekGrid.appendChild(column);
    });
  }

  function render(now = displayNow()) {
    const minute = Math.floor(now / 60000);
    if (minute !== lastClockMinute) {
      lastClockMinute = minute;
      const parts = clockFormat.formatToParts(now);
      text(el.clockTime, parts.filter(part => part.type !== 'dayPeriod').map(part => part.value).join('').trim());
      text(el.clockPeriod, parts.find(part => part.type === 'dayPeriod').value);
      text(el.clockDate, dateFormat.format(now));
    }
    const expired = isExpired(now);
    const stale = lastAttemptFailed || (!demo && now - lastSuccess > STALE_MS);
    const demoPrefix = demo ? 'Preview · ' : '';
    text(el.connectionStatus, demoPrefix + (expired ? lastAttemptFailed ? 'Schedule temporarily unavailable' : 'Connecting to schedule' : stale ? 'Reconnecting · schedule may have changed' : 'Schedule synced'));
    attr(el.connectionStatus, 'data-state', expired || stale ? 'offline' : 'online');
    attr(document.body, 'data-mode', expired ? 'loading' : feed.legacy ? 'legacy' : 'live');
    hidden(el.connectionNotice, !stale && !expired);
    text(el.connectionNotice, expired ? lastAttemptFailed ? 'Schedule Unavailable' : 'Connecting To Schedule' : 'Reconnecting · Schedule May Have Changed');
    const calendarState = feed && !expired && Feed.hasWeekCoverage(feed, now) ? Feed.displayState(feed.events, now) : null;
    const calendarVisible = calendarState?.mode === 'calendar';
    hidden(el.calendarView, !calendarVisible);
    hidden(el.welcomeView, calendarVisible);
    text(el.modeLabel, calendarVisible ? 'Weekly Rentals' : `Studio ${roomFilter}`);
    attr(document.body, 'data-view', calendarVisible ? 'calendar' : 'welcome');
    if (calendarVisible) {
      renderGreeting();
      renderNext(roomPrefix);
      renderProgress(roomPrefix);
      hidden(el.sessionBoard, true);
      renderCalendar(feed.events, calendarState, now);
      return;
    }
    if (!feed || expired) {
      renderGreeting();
      renderNext(roomPrefix);
      renderProgress(roomPrefix);
      hidden(el.sessionBoard, true);
      hidden(el.idleWelcome, false);
      attr(el.welcomeView, 'data-idle', 'true');
      return;
    }
    const relevantEvents = feed.events.filter(event => event.studio === roomFilter && (event.endMs ? event.endMs > now : event.startMs > now));
    const hasEvents = relevantEvents.length > 0;
    hidden(el.idleWelcome, hasEvents);
    hidden(el.sessionBoard, !hasEvents);
    attr(el.welcomeView, 'data-idle', String(!hasEvents));
    if (!hasEvents) { renderGreeting(); renderNext(roomPrefix); renderProgress(roomPrefix); return; }
    renderRoom(roomPrefix, roomPanel, relevantEvents, now, stale);
  }

  function accept(data) {
    feed = Feed.normalizeFeed(data);
    lastSuccess = Date.now();
    lastAttemptFailed = false;
    failureCount = 0;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: lastSuccess, feed })); } catch (_) { /* Storage may be disabled. */ }
    render();
  }
  function schedulePoll(delay) {
    clearTimeout(pollTimer);
    if (!document.hidden && !demo) pollTimer = setTimeout(loadFeed, delay);
  }
  function loadFeed() {
    if (request || document.hidden || demo) return;
    clearTimeout(pollTimer);
    if (!navigator.onLine) { fail(); schedulePoll(30000); return; }
    const callback = `smoothFeed_${++sequence}`;
    const script = document.createElement('script');
    let timeout;
    let finished = false;
    function finish(data, error) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      script.remove();
      delete window[callback];
      request = null;
      try { if (error) throw error; accept(data); } catch (_) { fail(); }
      schedulePoll(Math.min(60000, POLL_MS * Math.pow(2, failureCount)));
    }
    request = { cancel() { finished = true; clearTimeout(timeout); script.remove(); delete window[callback]; request = null; } };
    window[callback] = data => finish(data);
    script.onerror = () => finish(null, new Error('Feed unavailable'));
    script.onload = () => { if (!finished) finish(null, new Error('Feed did not respond')); };
    script.src = `${FEED_URL}?callback=${callback}&t=${Date.now()}`;
    script.referrerPolicy = 'no-referrer';
    timeout = setTimeout(() => finish(null, new Error('Feed timed out')), REQUEST_TIMEOUT_MS);
    document.head.appendChild(script);
  }
  function fail() { failureCount += 1; lastAttemptFailed = true; render(); }
  function tick() {
    clearTimeout(tickTimer);
    if (document.hidden) return;
    render();
    tickTimer = setTimeout(tick, 1000 - Date.now() % 1000 + 20);
  }
  try {
    const cache = demo ? null : JSON.parse(localStorage.getItem(CACHE_KEY));
    if (cache && Date.now() - cache.savedAt >= 0 && Date.now() - cache.savedAt < EXPIRE_MS && Array.isArray(cache.feed?.events)) {
      // Revalidate cached values rather than trusting edited or stale storage.
      feed = Feed.restoreFeed(cache.feed);
      lastSuccess = cache.savedAt;
      lastAttemptFailed = true;
    } else if (!demo) { localStorage.removeItem(CACHE_KEY); }
  } catch (_) { /* A missing cache never blocks startup. */ }
  if (demo) {
    const now = displayNow();
    const event = (firstName, studio, start, end) => ({ firstName, studio, startISO: new Date(now + start * 60000).toISOString(), endISO: new Date(now + end * 60000).toISOString() });
    feed = Feed.normalizeFeed({ schemaVersion: 2, events: demo === 'idle' ? [] : [event('Alex', 'A', -30, demo === 'urgent' ? 7 : 90), event('Jordan', 'B', -15, 45), event('Taylor', 'A', demo === 'urgent' ? 10 : 100, 160)] });
    if (demoEpoch !== null) {
      const samples = [
        ['A', 9, 12, 13], ['B', 9, 17, 18], ['A', 10, 14, 15],
        ['B', 11, 13, 14], ['A', 11, 18, 19], ['A', 12, 19, 19.5],
        ['A', 13, 12, 13], ['B', 13, 15, 16], ['A', 15, 14, 15.5]
      ];
      if (demo === 'busy') for (let hour = 9; hour < 18; hour++) samples.push([hour % 2 ? 'A' : 'B', 14, hour, hour + .5]);
      const instant = (day, hour) => new Date(Date.parse(`2026-11-${String(day).padStart(2, '0')}T00:00:00-05:00`) + hour * 3600000).toISOString();
      feed = Feed.normalizeFeed({ schemaVersion: 2, rangeStartISO: '2026-11-09T00:00:00-05:00', rangeEndISO: '2026-11-23T00:00:00-05:00',
        events: samples.map(([studio, day, start, end]) => ({ studio, firstName: '', startISO: instant(day, start), endISO: instant(day, end) })) });
    }
    lastSuccess = now;
    lastAttemptFailed = demo === 'offline';
  }
  document.addEventListener('visibilitychange', () => {
    clearTimeout(tickTimer);
    clearTimeout(pollTimer);
    if (document.hidden) { if (request) request.cancel(); }
    else { tick(); loadFeed(); }
  });
  window.addEventListener('online', loadFeed);
  window.addEventListener('offline', () => { lastAttemptFailed = true; render(); });
  window.addEventListener('pagehide', () => { clearTimeout(tickTimer); clearTimeout(pollTimer); if (request) request.cancel(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { tick(); loadFeed(); } });
  tick();
  loadFeed();
})();

