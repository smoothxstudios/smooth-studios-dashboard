// Smooth Studios Welcome TV — read-only, minimal Calendar feed.
// Optional Script Properties: CALENDAR_IDS (comma/newline-separated),
// STUDIO_A_CALENDAR_ID, STUDIO_B_CALENDAR_ID. Without IDs, use the single exact
// calendar named "Smooth Studios". Never fall back to a personal calendar.
// Public output contains first names and times, never descriptions/contact/pay.

const TV_TIME_ZONE = "America/New_York";
const TV_CACHE_KEY = "smooth-welcome-tv-v2";

function doGet(e) {
  const callback = e && e.parameter ? e.parameter.callback : null;
  if (callback && !/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(callback)) {
    return tvResponse(tvError("INVALID_CALLBACK"), null);
  }
  try {
    let cache = null, payload = null;
    try {
      cache = CacheService.getScriptCache();
      const cached = cache.get(TV_CACHE_KEY);
      if (cached) {
        const candidate = JSON.parse(cached);
        const age = Date.now() - Date.parse(candidate.generatedAt);
        if (candidate.ok === true && candidate.schemaVersion === 2 &&
            Array.isArray(candidate.events) && age >= 0 && age < 15000) payload = candidate;
      }
    } catch (_) { /* A cache miss never prevents a fresh Calendar read. */ }
    if (!payload) {
      payload = tvBuildFeed(new Date());
      try { if (cache) cache.put(TV_CACHE_KEY, JSON.stringify(payload), 15); } catch (_) { /* Optional cache. */ }
    }
    return tvResponse(payload, callback);
  } catch (error) {
    // Google exception messages can contain private calendar identifiers.
    return tvResponse(tvError(error && error.tvCode || "FEED_UNAVAILABLE"), callback);
  }
}

function tvResponse(payload, callback) {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return ContentService.createTextOutput(callback ? callback + "(" + json + ");" : json)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function tvError(code) {
  return { schemaVersion: 2, ok: false, generatedAt: new Date().toISOString(),
    timeZone: TV_TIME_ZONE, error: { code: code } };
}

function tvUnavailable(code) {
  const error = new Error("Welcome TV calendar unavailable");
  error.tvCode = code;
  throw error;
}

function tvCalendars() {
  const properties = PropertiesService.getScriptProperties();
  const sources = [];
  const add = function (id, studio) {
    id = String(id || "").trim();
    if (!id) return;
    const existing = sources.find(function (source) { return source.id === id; });
    if (existing) {
      if (existing.studio && studio && existing.studio !== studio) tvUnavailable("CALENDAR_CONFIGURATION");
      existing.studio = existing.studio || studio;
    } else sources.push({ id: id, studio: studio });
  };
  String(properties.getProperty("CALENDAR_IDS") || "").split(/[,\n]/).forEach(function (id) { add(id, null); });
  add(properties.getProperty("STUDIO_A_CALENDAR_ID"), "A");
  add(properties.getProperty("STUDIO_B_CALENDAR_ID"), "B");
  if (sources.length) {
    return sources.map(function (source) {
      const calendar = CalendarApp.getCalendarById(source.id);
      if (!calendar) tvUnavailable("CALENDAR_UNAVAILABLE");
      return { calendar: calendar, studio: source.studio };
    });
  }
  const calendars = CalendarApp.getCalendarsByName("Smooth Studios");
  if (!calendars || calendars.length !== 1) tvUnavailable("CALENDAR_CONFIGURATION");
  return [{ calendar: calendars[0], studio: null }];
}

function tvPlainText(value) {
  return String(value || "").replace(/<br\s*\/?\s*>|<\/(?:p|div)>/gi, "\n")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "");
}

function tvFirstName(title, description) {
  const named = description.match(/^\s*Name\s*:\s*([^\r\n]+)/im);
  const prefix = title.indexOf(":") > 0 ? title.slice(0, title.indexOf(":")) : "";
  const candidate = (named ? named[1] : prefix).trim().split(/\s+/)[0] || "";
  if (!candidate || /[@<>/:\d]/.test(candidate) || candidate.length > 48) return "";
  return candidate.replace(/^[^A-Za-z\u00c0-\uffff]+|[^A-Za-z\u00c0-\uffff'’\-]+$/g, "");
}

function tvStudio(title, description, calendarStudio) {
  const rooms = [];
  const add = function (room) { if (rooms.indexOf(room) < 0) rooms.push(room); };
  if (calendarStudio) add(calendarStudio);
  const inspect = function (value, bareRoom) {
    const pattern = /\b(?:studio|rental)[\s:–—-]+([ab])\b/gi;
    let match;
    while ((match = pattern.exec(value))) {
      add(match[1].toUpperCase());
      const suffix = value.slice(pattern.lastIndex);
      const both = suffix.match(/^\s*(?:&|and|\/|\+)\s*(?:studio\s+)?([ab])\b/i);
      if (both) add(both[1].toUpperCase());
    }
    if (bareRoom && /^[ab]$/i.test(value.trim())) add(value.trim().toUpperCase());
    if (bareRoom && /^(?:both|a\s*(?:&|and|\/|\+)\s*b)$/i.test(value.trim())) { add("A"); add("B"); }
  };
  // The customer-name prefix is not an appointment-type/room label.
  inspect(title.indexOf(":") >= 0 ? title.slice(title.indexOf(":") + 1) : title, false);
  const lines = description.split(/\r?\n/).map(function (line) { return line.trim(); });
  lines.forEach(function (line, index) {
    if (/^studio\s+[ab]\s+rental\s+form\s*$/i.test(line)) inspect(line, false);
    const field = line.match(/^(calendar|studio|room|studio\s+(?:room|selection)|which\s+studio(?:\s+(?:are\s+you\s+(?:renting|booking)|would\s+you\s+like))?\??)\s*:\s*(.*)$/i);
    if (field) inspect(field[2] || lines[index + 1] || "", true);
  });
  return rooms.length === 1 ? rooms[0] : null;
}

function tvMidnight(localDate) {
  const wallTime = Date.parse(localDate + "T00:00:00Z");
  let instant = wallTime;
  for (let attempt = 0; attempt < 4; attempt++) {
    const offset = Utilities.formatDate(new Date(instant), TV_TIME_ZONE, "Z");
    const sign = offset.charAt(0) === "-" ? -1 : 1;
    const minutes = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5)));
    const next = wallTime - minutes * 60000;
    if (next === instant) break;
    instant = next;
  }
  return new Date(instant);
}

function tvBuildFeed(now) {
  const date = Utilities.formatDate(now, TV_TIME_ZONE, "yyyy-MM-dd");
  const afterTomorrow = new Date(Date.parse(date + "T00:00:00Z") + 2 * 86400000).toISOString().slice(0, 10);
  const from = tvMidnight(date), until = tvMidnight(afterTomorrow);
  const unique = {};
  tvCalendars().forEach(function (source) {
    source.calendar.getEvents(from, until).forEach(function (event) {
      if (event.isAllDayEvent()) return;
      const title = tvPlainText(event.getTitle());
      if (/\b(?:cancelled|canceled)\b/i.test(title) ||
          !/\bstudio(?:[\s:–—-]+[ab])?[\s:–—-]+rental\b|\brental[\s:–—-]+[ab]\b/i.test(title)) return;
      const start = event.getStartTime(), end = event.getEndTime();
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
          end <= now || end <= start || start >= until) return;
      const description = tvPlainText(event.getDescription());
      const session = { firstName: tvFirstName(title, description),
        studio: tvStudio(title, description, source.studio),
        startISO: start.toISOString(), endISO: end.toISOString() };
      // Calendar identifiers remain server-side and are never returned.
      const key = event.getId() + "|" + session.startISO + "|" + session.endISO;
      if (unique[key]) {
        if (unique[key].studio !== session.studio) unique[key].studio = null;
      } else unique[key] = session;
    });
  });
  const events = Object.keys(unique).map(function (key) { return unique[key]; })
    .sort(function (a, b) { return Date.parse(a.startISO) - Date.parse(b.startISO) || String(a.studio).localeCompare(String(b.studio)); });
  const current = events.find(function (event) { return Date.parse(event.startISO) <= now.getTime() && Date.parse(event.endISO) > now.getTime(); }) || null;
  const pivot = current ? Date.parse(current.endISO) : now.getTime();
  const next = events.find(function (event) { return Date.parse(event.startISO) >= pivot; }) || null;
  const legacyTitle = function (event) { return event ? (event.firstName ? event.firstName + ": " : "") + "Studio Rental" : null; };
  return { schemaVersion: 2, ok: true, generatedAt: now.toISOString(), timeZone: TV_TIME_ZONE, events: events,
    // Keep the existing single-session display working during the update.
    isLive: Boolean(current), title: legacyTitle(current),
    startISO: current ? current.startISO : null, endISO: current ? current.endISO : null,
    nextTitle: legacyTitle(next), nextStartISO: next ? next.startISO : null };
}
