// script.js (FULL) — Ultra-smooth countdown + uppercase + red timer <= 10 min

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyCW9D8uiFxeQMb5P4EDpnl-oIzwq7dIId-K91oXMUlC4nDPSvnTMtqFj03ZJ7vlsK6sA/exec";

/* =========================
   Refresh Settings
   =========================
   FEED_REFRESH_MS: how often we ask Google for updated event info
   UI_TICK_MS:      how often we redraw countdown locally (smooth)
*/
const FEED_REFRESH_MS = 10000; // Customize: 10s recommended
const UI_TICK_MS = 100;        // 100ms feels very smooth

function pad(n) {
  return String(n).padStart(2, "0");
}

/* =========================
   Name parsing (First name only)
   Titles like: "Akiva Bell: Studio Rental (Smooth Studios)"
*/
function extractFirstName(eventTitle) {
  if (!eventTitle) return "";
  const beforeColon = eventTitle.split(":")[0].trim(); // "Akiva Bell"
  const first = beforeColon.split(/\s+/)[0].trim();    // "Akiva"
  return first || beforeColon;
}

function formatTimeRange(startISO, endISO) {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const opts = { hour: "numeric", minute: "2-digit" };
  return `${s.toLocaleTimeString([], opts)} – ${e.toLocaleTimeString([], opts)}`;
}

function formatDateLine() {
  const now = new Date();
  return now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/* =========================
   UI Elements
   ========================= */
const screensaverEl = document.getElementById("screensaver");
const ssLogo = document.getElementById("ssLogo");

const sessionUI = document.getElementById("sessionUI");
const timeRow = document.getElementById("timeRow");
const dateRow = document.getElementById("dateRow");
const clientNameEl = document.getElementById("clientName");

/* =========================
   State
   ========================= */
let hasFetchedOnce = false;

// Live session cached locally for ultra-smooth countdown redraw
let liveSession = null;
// shape:
// { title, startISO, endISO, timeRangeText, firstName }

/* =========================
   Screensaver Bounce Logic
   ========================= */
let vx = 2.6; // Customize: horizontal speed
let vy = 2.2; // Customize: vertical speed
let x = 60, y = 60;

function tickScreensaver() {
  if (!screensaverEl || !ssLogo) {
    requestAnimationFrame(tickScreensaver);
    return;
  }

  if (screensaverEl.style.display === "none") {
    requestAnimationFrame(tickScreensaver);
    return;
  }

  const w = window.innerWidth;
  const h = window.innerHeight;

  const rect = ssLogo.getBoundingClientRect();
  const lw = rect.width || 220;
  const lh = rect.height || 220;

  x += vx;
  y += vy;

  if (x <= 0) { x = 0; vx *= -1; }
  if (y <= 0) { y = 0; vy *= -1; }
  if (x + lw >= w) { x = w - lw; vx *= -1; }
  if (y + lh >= h) { y = h - lh; vy *= -1; }

  ssLogo.style.transform = `translate(${x}px, ${y}px)`;
  requestAnimationFrame(tickScreensaver);
}
requestAnimationFrame(tickScreensaver);

/* =========================
   Mode Switching
   ========================= */
function showScreensaver() {
  if (sessionUI) sessionUI.classList.add("hidden");
  if (screensaverEl) screensaverEl.style.display = "block";
}

function showSessionUI() {
  if (screensaverEl) screensaverEl.style.display = "none";
  if (sessionUI) sessionUI.classList.remove("hidden");
}

function hideBothUntilFirstFetch() {
  // Prevent “flash” on load
  if (screensaverEl) screensaverEl.style.display = "none";
  if (sessionUI) sessionUI.classList.add("hidden");
}

/* =========================
   Ultra Smooth Countdown Renderer
   - Timer turns RED when 10 minutes and under
   - Adds m/s indicators next to numbers
   ========================= */
function renderCountdown() {
  if (dateRow) dateRow.textContent = formatDateLine();

  if (!liveSession || !liveSession.endISO) return;

  const nowMs = Date.now();
  const endMs = new Date(liveSession.endISO).getTime();
  let msLeft = endMs - nowMs;

  if (msLeft <= 0) {
    liveSession = null;
    showScreensaver();
    return;
  }

  const totalSeconds = Math.floor(msLeft / 1000);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Turn timer red when <= 10 minutes
  if (timeRow) {
    if (minutes <= 10) timeRow.classList.add("urgent");
    else timeRow.classList.remove("urgent");
  }

  const leftHTML =
    `${minutes}<span class="unit">m</span> ` +
    `${pad(seconds)}<span class="unit">s</span> Left`;

  if (timeRow) {
    timeRow.innerHTML =
      `Appointment Time: ${liveSession.timeRangeText}  •  ${leftHTML}`;
  }
}

/* =========================
   JSONP Callback (MUST be global)
   ========================= */
window.handleSmoothFeed = function (data) {
  hasFetchedOnce = true;

  if (dateRow) dateRow.textContent = formatDateLine();

  // Only show UI if LIVE. Otherwise: screensaver.
  if (!data || !data.title || !data.isLive) {
    liveSession = null;
    showScreensaver();
    return;
  }

  // Live session UI
  showSessionUI();

  const firstName = extractFirstName(data.title);
  if (clientNameEl) {
    // We already uppercase via CSS, but this keeps it consistent everywhere.
    clientNameEl.textContent = firstName.toUpperCase();
  }

  liveSession = {
    title: data.title,
    startISO: data.startISO,
    endISO: data.endISO,
    timeRangeText: formatTimeRange(data.startISO, data.endISO),
    firstName,
  };

  renderCountdown();
};

/* =========================
   JSONP Loader
   ========================= */
function loadFeed() {
  const old = document.getElementById("jsonp");
  if (old) old.remove();

  const s = document.createElement("script");
  s.id = "jsonp";
  s.src = `${APPS_SCRIPT_URL}?callback=handleSmoothFeed&t=${Date.now()}`;

  s.onerror = () => {
    // Never get stuck: before first fetch, hide both (no flash).
    // After first fetch, fallback to screensaver.
    if (!hasFetchedOnce) hideBothUntilFirstFetch();
    else showScreensaver();
  };

  document.body.appendChild(s);
}

/* =========================
   Start
   ========================= */
if (dateRow) dateRow.textContent = formatDateLine();

// Prevent initial flash
hideBothUntilFirstFetch();

// Start feed polling
loadFeed();
setInterval(loadFeed, FEED_REFRESH_MS);

// Start smooth countdown redraw
setInterval(renderCountdown, UI_TICK_MS);
