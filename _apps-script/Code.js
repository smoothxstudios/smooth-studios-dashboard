// =======================================================
// Smooth Studios Calendar Feed (JSONP)
// =======================================================
// Returns ONLY events that contain:
// - "Studio Rental" OR "Quick Studio Rental"
// Returns current live event (if any). If none live, returns next event.
// Dashboard will choose to show only LIVE (screensaver otherwise).
// =======================================================

function doGet(e) {
  const callback = (e && e.parameter && e.parameter.callback) ? e.parameter.callback : null;

  const CAL_NAME = "Smooth Studios"; // must match your calendar name
  const INCLUDE_KEYWORDS = ["Studio Rental", "Quick Studio Rental"]; // filter

  const now = new Date();

  // Search window (today)
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  // Find calendar
  const cals = CalendarApp.getCalendarsByName(CAL_NAME);
  const cal = (cals && cals.length) ? cals[0] : CalendarApp.getDefaultCalendar();

  // Get today's events
  const events = cal.getEvents(dayStart, dayEnd)
    .filter(ev => {
      const t = ev.getTitle() || "";
      return INCLUDE_KEYWORDS.some(k => t.includes(k));
    })
    .sort((a, b) => a.getStartTime().getTime() - b.getStartTime().getTime());

  // Find CURRENT live event
  const current = events.find(ev => ev.getStartTime() <= now && ev.getEndTime() > now) || null;

  // Find NEXT event after current ends (or after now if no current)
  const pivot = current ? current.getEndTime().getTime() : now.getTime();

  const nextAfter = events.find(ev => ev.getStartTime().getTime() >= pivot) || null;

  // Payload
  const payload = {
    isLive: Boolean(current),
    title: current ? current.getTitle() : null,
    startISO: current ? current.getStartTime().toISOString() : null,
    endISO: current ? current.getEndTime().toISOString() : null,

    // "Next Up" AFTER CURRENT SESSION ENDS
    nextTitle: nextAfter ? nextAfter.getTitle() : null,
    nextStartISO: nextAfter ? nextAfter.getStartTime().toISOString() : null
  };

  const json = JSON.stringify(payload);

  // JSONP response (for your frontend)
  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  // fallback JSON
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
