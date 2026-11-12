# Smooth Studios Welcome TV

Read-only TV display at https://smoothxstudios.github.io/smooth-studios-dashboard/.
The existing GitHub Pages and linked Netlify deployments remain in place.

## Display

- Rounded charcoal cards, red brand accents, and large text matching the approved TV concepts.
- During the booking day, each TV shows its assigned room's personal welcome, session time, and countdown. Names use only the existing first-name field.
- The final-ten-minute warning, remaining-time bar, and next guest are preserved.
- After the last appointment across both studios ends, show the current Monday–Sunday rental calendar for both rooms. Studio A is red; Studio B is blue. The weekly view shows room labels and times, not client names.
- Keep the calendar overnight and on empty days until exactly one hour before the next scheduled booking. Between same-day bookings, keep the welcome display. Active overnight bookings stay on the welcome display.
- All dates and switching boundaries use America/New_York, including DST. The week rolls over at local Monday midnight.
- A busy day shows three rentals at a time and automatically rotates pages every twelve seconds. The day shows its page number and total rental count.
- No buttons, clickable links, employee information, or editing controls on the TV.

| TV | Launch URL |
| --- | --- |
| Studio A | https://smoothxstudios.github.io/smooth-studios-dashboard/ |
| Studio B | https://smoothxstudios.github.io/smooth-studios-dashboard/?studio=B |

Refresh an already-open Chromium kiosk once after a code release. Calendar data and display transitions then update automatically.

## Calendar feed and deployment

`_apps-script/Code.js` is the source of the existing Google Apps Script web app. Saving it in Git does not deploy it to Google.

**v3 deployment status:** Live. The owner approved the expanded public room/time feed on November 12, 2026, and the existing Apps Script web app was updated to Version 13. Both TV URLs now receive the full weekly coverage required for automatic calendar mode.

The v3 feed includes completed bookings in the current week and future rentals through the following Sunday, with explicit range coverage metadata. This supports weekly history, empty days, and Sunday/Monday transitions. Additional history and lookahead contain studio labels and times only; first names are limited to the pre-existing live today/tomorrow window. No descriptions, contact information, payment details, employee data, or calendar IDs are returned.

The script reads the exact calendar named **Smooth Studios**, unless Script Properties configure `CALENDAR_IDS`, `STUDIO_A_CALENDAR_ID`, or `STUDIO_B_CALENDAR_ID`. It never falls back to a personal calendar. Room inference uses explicit appointment labels or room fields. It retains the existing Studio Rental, Quick Studio Rental, Studio A Rental, and Studio B Rental categories. Unknown or conflicting room assignments are never guessed. Cancelled, all-day, invalid, and unrelated events are excluded.

The TV requests the feed every ten seconds after success; calendar reads are cached for fifteen seconds. Requests never overlap, time out after fifteen seconds, and back off on failure. A brief outage keeps the last confirmed schedule with a visible amber notice. After five minutes, stale schedules and personal greetings are hidden. A validated local cache survives short restarts. Hidden tabs suspend work and resume immediately.

## Verification

Run `node --test tests/*.test.cjs`. Coverage includes the exact last-end and one-hour thresholds, same-day gaps, overlapping and overnight bookings, empty days, Monday rollover, DST transitions, independent room welcomes, busy-day paging, privacy, feed failures, JSONP cleanup/retry, and cache expiry.

Preview samples with `?demo=weekly`, `?demo=welcome`, or `?demo=busy`. Existing `?demo=dual`, `?demo=urgent`, `?demo=idle`, and `?demo=offline` remain available. Samples are explicitly labeled, never contact the calendar, and never modify the live cache. Remove `demo` for actual bookings; retain `studio=B` when appropriate.

## Releases

### 3.0.0 — November 12, 2026

Implemented the approved welcome and weekly-calendar layouts, automatic after-hours scheduling, both-room weekly cards, and busy-day rotation. Activated the approved weekly Apps Script feed as Version 13.

### 2.2.3 — October 17, 2026

Added “hrs” after hour-based countdowns and “min” when less than an hour remains, for both upcoming and active sessions.

### 2.2.2 — October 17, 2026

Increased the progress bar thickness and enlarged the welcome, clock, countdown, session range, labels, and status text for TV viewing. Loosened the guest-name letter spacing, widened the session area, and raised secondary-text contrast while preserving the simple layout and remaining-time calculation.

### 2.2.1 — October 17, 2026

Removed the comma after Smooth Studios and the period after the guest’s name in the personal welcome.

### 2.2.0 — October 17, 2026

Set displayed guest names in all caps. Moved session details directly beneath the personal welcome, with remaining time and the session range floating above a thin progress bar. The fill follows the active session’s remaining time, resets at booking transitions, and stays hidden for upcoming bookings or expired schedule data. The existing one-second clock updates drive the bar without adding timers.

### 2.1.1 — October 17, 2026

Removed the red ring background and studio slogan. Centered the personal welcome across the full display while retaining the logo, clock, and compact session details.

### 2.1.0 — October 17, 2026

Recomposed the TV as a branded welcome backdrop with a prominent personal greeting, static red graphic depth, and a compact session rail. Removed the room-card heading, Guest block, eyebrow, and redundant courtesy row. The next-booking row appears only during the current session’s final ten minutes when a next booking exists. The separate A/B URLs and automatic schedule updates are preserved.

### 2.0.2 — October 17, 2026

Removed the entire bottom footer strip and its unused styling. Added the room’s displayed guest after “Welcome to Smooth Studios,” with automatic updates at session transitions and a generic greeting when the schedule is empty or expires. Preview mode remains visibly labeled beside the room name. Added manual calendar test instructions.

### 2.0.1 — October 17, 2026

Made the display fully read-only and removed the clickable website link. The existing TV URL now shows Studio A only. The separate Studio B URL is ready for its future Raspberry Pi, with a persistent room label and the same large single-room layout.

### 2.0 — October 17, 2026

Rebuilt the Welcome TV in the current Studio Dashboard style. Added independent room sessions, repaired hour-long timers, improved idle and reconnection states, removed broken CSS and continuous layout work, and upgraded the minimal calendar feed for both studios. Existing TV URL retained.

To update an already-open kiosk after a code release, refresh Chromium once. Schedule updates then continue automatically.

