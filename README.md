# Smooth Studios Welcome TV

Client-facing studio display at https://smoothxstudios.github.io/smooth-studios-dashboard/.
The existing GitHub Pages and linked Netlify deployments remain in place.

## Display

- A dedicated, read-only TV display for each room. The original URL defaults to Studio A; `?studio=B` shows Studio B only.
- A personal welcome using the displayed guest’s first name, Eastern-time session ranges, and countdowns that retain hours.
- A restrained red warning during the final ten minutes; next guest appears in that room’s final-ten-minute row.
- Only the selected room’s bookings appear. Unmapped rentals are excluded; never guess a room.
- A welcome screen when no sessions remain, and a subtle amber session status during brief outages.
- No clickable links, controls, or room-switching UI. The room is identified during sessions, loading, and idle states.

| TV | Raspberry Pi launch URL |
| --- | --- |
| Studio A | https://smoothxstudios.github.io/smooth-studios-dashboard/ |
| Studio B | https://smoothxstudios.github.io/smooth-studios-dashboard/?studio=B |

The design uses the Studio Dashboard’s charcoal/red palette, flat panels, divider rows, and reduced-motion support. It uses local logo assets and system fonts, with no frontend packages, build step, background video, animation loop, or recurring full-page reload.

## Calendar feed

`_apps-script/Code.js` is the source for the existing Google Apps Script web app. Its deployment is separate from GitHub Pages; saving this file in Git does not deploy it to Google.

The script reads the exact calendar named **Smooth Studios**, unless Script Properties configure `CALENDAR_IDS`, `STUDIO_A_CALENDAR_ID`, or `STUDIO_B_CALENDAR_ID`. It never falls back to a personal calendar. Room inference uses explicit appointment labels or room fields. It retains Studio Rental, Quick Studio Rental, Studio A Rental, and Studio B Rental.

Public output is limited to first names, room labels, and session times. It does not return descriptions, client contact details, payment information, calendar IDs, or employee data. Failure responses are distinguishable from an empty schedule.

The screen requests the feed every ten seconds after a successful response. Calendar reads are cached for fifteen seconds. Requests never overlap, time out after fifteen seconds, and back off after failures. A brief outage preserves the last confirmed schedule with an amber session status; after five minutes it hides the stale schedule and clears the personal welcome. Connection details remain available to assistive technology. A timestamped local cache survives short kiosk restarts. Hidden tabs suspend work and resume on return.

## Manual booking tests

Create a timed event in the calendar configured for the existing TV feed. A separate test calendar will not be read unless it is explicitly configured.

| Field | Studio A | Studio B |
| --- | --- | --- |
| Title | `Alex Test: Studio A Rental` | `Jordan Test: Studio B Rental` |
| Start | Five minutes ago | Five minutes ago |
| End | Thirty minutes from now | Thirty minutes from now |
| All-day | Off | Off |

These titles provide both the guest and room; no description is required. An optional description with `Name: Alex Test` and `Studio: A` on separate lines also works. `Name:` overrides the title’s name. Only the first name is displayed. Room labels must agree; conflicting or missing rooms are excluded. No payment information or booking ID is required.

Allow roughly 20–30 seconds for the event to appear. A current event shows time remaining; when there is no current event, the next booking appears immediately with “Starts in.” The feed includes active sessions and future bookings through tomorrow in Eastern time. All-day events, ended bookings, and titles containing “Canceled” or “Cancelled” are excluded.

To test the final-ten-minute warning, set Alex’s end to eight minutes from now and add `Taylor Test: Studio A Rental` starting ten minutes from now. Alex should show “Wrapping up” and Taylor should appear in “Up next.” Use the normal room URLs without a `demo=` parameter for real calendar tests. Delete test events when finished.

## Verification

Run `node --test tests/*.test.cjs`. Tests cover simultaneous rooms, exact session boundaries, long timers, legacy feeds, JSONP cleanup/retry, caching and outages, room filtering, privacy, calendar failures, overnight bookings, and daylight-saving changes.

Preview sample states using `?demo=dual`, `?demo=urgent`, `?demo=idle`, or `?demo=offline`. Preview mode is labeled, never calls the calendar, and does not modify the live cache. These are simulated guests, not bookings. Remove the query string for normal operation.

## Releases

### 2.0.2 — October 17, 2026

Removed the entire bottom footer strip and its unused styling. Added the room’s displayed guest after “Welcome to Smooth Studios,” with automatic updates at session transitions and a generic greeting when the schedule is empty or expires. Preview mode remains visibly labeled beside the room name. Added manual calendar test instructions.

### 2.0.1 — October 17, 2026

Made the display fully read-only and removed the clickable website link. The existing TV URL now shows Studio A only. The separate Studio B URL is ready for its future Raspberry Pi, with a persistent room label and the same large single-room layout.

### 2.0 — October 17, 2026

Rebuilt the Welcome TV in the current Studio Dashboard style. Added independent room sessions, repaired hour-long timers, improved idle and reconnection states, removed broken CSS and continuous layout work, and upgraded the minimal calendar feed for both studios. Existing TV URL retained.

To update an already-open kiosk after a code release, refresh Chromium once. Schedule updates then continue automatically.
