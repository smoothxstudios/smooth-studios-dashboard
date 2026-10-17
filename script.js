/* Smooth Studios Welcome TV — no framework, no full-page refreshes. */
(function () {
  'use strict';
  const Feed = window.SmoothFeed;
  const FEED_URL = 'https://script.google.com/macros/s/AKfycbyCW9D8uiFxeQMb5P4EDpnl-oIzwq7dIId-K91oXMUlC4nDPSvnTMtqFj03ZJ7vlsK6sA/exec';
  const POLL_MS = 10000;
  const REQUEST_TIMEOUT_MS = 15000;
  const STALE_MS = 60000;
  const EXPIRE_MS = 300000;
  const CACHE_KEY = 'smooth-welcome-tv-v2';
  const params = new URLSearchParams(location.search);
  // The existing kiosk lives in Studio A. Studio B has its own ?studio=B URL.
  const roomFilter = (params.get('studio') || '').toUpperCase() === 'B' ? 'B' : 'A';
  const demo = ['dual', 'urgent', 'idle', 'offline'].includes(params.get('demo')) ? params.get('demo') : null;
  const el = {};
  document.querySelectorAll('[id]').forEach(node => { el[node.id] = node; });
  const roomPrefix = roomFilter.toLowerCase();
  const roomPanel = el[`studio${roomFilter}`];
  document.title = `Studio ${roomFilter} | Smooth Studios`;
  text(el.studioLabel, `STUDIO ${roomFilter}`);
  attr(document.body, 'data-studio', roomFilter);
  hidden(el.studioA, roomFilter !== 'A');
  hidden(el.studioB, roomFilter !== 'B');
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

  function text(node, value) { if (node && node.textContent !== value) node.textContent = value; }
  function hidden(node, value) { if (node && node.hidden !== value) node.hidden = value; }
  function attr(node, key, value) { if (node && node.getAttribute(key) !== value) node.setAttribute(key, value); }
  function isExpired(now) { return !lastSuccess || (!demo && now - lastSuccess > EXPIRE_MS); }

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
    text(el[`${prefix}Name`], current ? state.active.map(event => event.firstName).join(' & ') : upcoming ? next.firstName : 'Make yourself at home.');
    text(el[`${prefix}TimerLabel`], current ? 'Time remaining' : upcoming ? 'Starts in' : 'Welcome to Smooth Studios');
    text(el[`${prefix}Timer`], current ? Feed.countdown(current.endMs, now) : upcoming ? Feed.countdown(next.startMs, now) : '—');
    text(el[`${prefix}Session`], current ? Feed.timeRange(current) : upcoming ? `${Feed.upcomingTime(next, now)}${next.endMs ? ` – ${clockFormat.format(next.endMs)}` : ''}` : 'Enjoy your time here.');
    const showNext = current && next && urgent;
    text(el[`${prefix}NextLabel`], showNext ? 'Up next' : 'Welcome');
    text(el[`${prefix}Next`], showNext ? `${next.firstName} · ${Feed.upcomingTime(next, now)}` : current ? 'Thank you for creating with us.' : upcoming ? 'We’ll see you soon.' : 'Ask our team if you need anything.');
  }

  function render(now = Date.now()) {
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
    if (!feed || expired) {
      hidden(el.sessionBoard, true);
      hidden(el.idleWelcome, false);
      text(el.heroSubtitle, `Welcome to Studio ${roomFilter}. Make yourself at home.`);
      return;
    }
    const relevantEvents = feed.events.filter(event => event.studio === roomFilter && (event.endMs ? event.endMs > now : event.startMs > now));
    const hasEvents = relevantEvents.length > 0;
    hidden(el.idleWelcome, hasEvents);
    hidden(el.sessionBoard, !hasEvents);
    text(el.heroSubtitle, `Your time in Studio ${roomFilter}.`);
    if (!hasEvents) return;
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
  text(el.displayVersion, 'Welcome TV · v2.0.1');
  if (demo) {
    const now = Date.now();
    const event = (firstName, studio, start, end) => ({ firstName, studio, startISO: new Date(now + start * 60000).toISOString(), endISO: new Date(now + end * 60000).toISOString() });
    feed = Feed.normalizeFeed({ schemaVersion: 2, events: demo === 'idle' ? [] : [event('Alex', 'A', -30, demo === 'urgent' ? 7 : 90), event('Jordan', 'B', -15, 45), event('Taylor', 'A', demo === 'urgent' ? 10 : 100, 160)] });
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
