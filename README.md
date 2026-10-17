# Smooth Studios Welcome TV

Client-facing studio display at https://smoothxstudios.github.io/smooth-studios-dashboard/.
The existing GitHub Pages and linked Netlify deployments remain in place.

## Display

- Separate Studio A and Studio B sessions, including simultaneous rentals.
- First names, Eastern-time session ranges, and countdowns that retain hours.
- A restrained red warning during the final ten minutes; next guest appears in that room’s final-ten-minute row.
- Unmapped rentals remain in a neutral Studio session panel; never guess a room.
- A welcome screen when no sessions remain, and quiet reconnect status during outages.
- Optional `?studio=A` or `?studio=B` for a screen dedicated to one room.

The design uses the Studio Dashboard’s charcoal/red palette, flat panels, divider rows, and reduced-motion support. It uses local logo assets and system fonts, with no frontend packages, build step, background video, animation loop, or recurring full-page reload.

## Calendar feed

`_apps-script/Code.js` is the source for the existing Google Apps Script web app. Its deployment is separate from GitHub Pages; saving this file in Git does not deploy it to Google.

The script reads the exact calendar named **Smooth Studios**, unless Script Properties configure `CALENDAR_IDS`, `STUDIO_A_CALENDAR_ID`, or `STUDIO_B_CALENDAR_ID`. It never falls back to a personal calendar. Room inference uses explicit appointment labels or room fields. It retains Studio Rental, Quick Studio Rental, Studio A Rental, and Studio B Rental.

Public output is limited to first names, room labels, and session times. It does not return descriptions, client contact details, payment information, calendar IDs, or employee data. Failure responses are distinguishable from an empty schedule.

The screen requests the feed every ten seconds after a successful response. Calendar reads are cached for fifteen seconds. Requests never overlap, time out after fifteen seconds, and back off after failures. A brief outage preserves the last confirmed schedule with a reconnect label; after five minutes it hides the stale schedule. A timestamped local cache survives short kiosk restarts. Hidden tabs suspend work and resume on return.

## Verification

Run `node --test tests/*.test.cjs`. Tests cover simultaneous rooms, exact session boundaries, long timers, legacy feeds, JSONP cleanup/retry, caching and outages, room filtering, privacy, calendar failures, overnight bookings, and daylight-saving changes.

Preview sample states using `?demo=dual`, `?demo=urgent`, `?demo=idle`, or `?demo=offline`. Preview mode is labeled, never calls the calendar, and does not modify the live cache. These are simulated guests, not bookings. Remove the query string for normal operation.

## Releases

### 2.0 — October 17, 2026

Rebuilt the Welcome TV in the current Studio Dashboard style. Added independent room sessions, repaired hour-long timers, improved idle and reconnection states, removed broken CSS and continuous layout work, and upgraded the minimal calendar feed for both studios. Existing TV URL retained.

To update an already-open kiosk after a code release, refresh Chromium once. Schedule updates then continue automatically.
