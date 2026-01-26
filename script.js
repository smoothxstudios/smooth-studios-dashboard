// =======================================================
// Smooth Studios TV Dashboard - script.js (ULTRA SMOOTH)
// =======================================================
// - Polls Apps Script FEED every 10s (safe)
// - Countdown updates locally ~10x/sec (ultra smooth)
// - Shows session UI ONLY when isLive === true
// - Otherwise shows bouncing logo screensaver
// - Adds "Appointment Time:" prefix
// - Adds minutes/seconds indicators (m / s) next to numbers
// - Prevents 1-second screensaver flash on load
// =======================================================

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyCW9D8uiFxeQMb5P4EDpnl-oIzwq7dIId-K91oXMUlC4nDPSvnTMtqFj03ZJ7vlsK6sA/exec";

/* =========================
   Refresh Settings
   =========================
   FEED_REFRESH_MS = how often we ask Google for updated event info
   UI_TICK_MS      = how often we redraw the countdown locally
*/
const FEED_REFRESH_MS = 10000; // Customize: 5s / 10s / 15s (recommended 10s)
const UI_TICK_MS = 100;        // Customize: 100ms = very smooth (10 FPS)

/* =========================
   Helper Functions
   ========================= */
function pad(n) {
  return String(n).padStart(2, "0");
}

function extractFirstName(eventTitle) {
  if (!eventTitle) return "";
  // Example: "Akiva Bell: Studio Rental (Smooth Studios)"
  const beforeColon = eventTitle.split(":")[0].trim(); // "Akiva Bell"
  return beforeColon.split(/\s+/)[0].trim();           // "Akiva"
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
const statusPill = document.getElementById("statusPill");
const timeRow = document.getElementById("timeRow");      // We will use innerHTML for units
const dateRow = document.getElementById("dateRow");
const clientNameEl = document.getElementById("clientName");

/* =========================
   State
   ========================= */
let hasFetchedOnce = false;

// The “current live session” details we keep locally for smooth countdown redraw
let liveSession = null;
// shape:
// {
//   title, startISO, endISO,
//   timeRangeText,
//   clientFirstName
// }

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

  // Only animate if screensaver visible
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
   UI Mode Switching
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
  // Prevent the “flash” where screensaver shows for a second before live appointment loads
  if (screensaverEl) screensaverEl.style.display = "none";
  if (sessionUI) sessionUI.classList.add("hidden");
}

/* =========================
   Ultra Smooth Countdown Renderer
   ========================= */
function renderCountdown() {
  if (dateRow) dateRow.textContent = formatDateLine();

  // If no live session, do nothing (screensaver handles display)
  if (!liveSession || !liveSession.endISO) return;

  const now = Date.now();
  const endMs = new Date(liveSession.endISO).getTime();
  let msLeft = endMs - now;

  if (msLeft <= 0) {
    // Session ended — force re-check on next poll; show screensaver meanwhile
    liveSession = null;
    showScreensaver();
    return;
  }

  const totalSeconds = Math.floor(msLeft / 1000);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // IMPORTANT: units next to numbers
  const leftHTML =
    `${minutes}<span class="unit">m</span> ` +
    `${pad(seconds)}<span class="unit">s</span> Left`;

  // “Appointment Time:” prefix requested
  if (timeRow) {
    timeRow.innerHTML = `Appointment Time: ${liveSession.timeRangeText}  •  ${leftHTML}`;
  }
}

/* =========================
   JSONP Callback (MUST be global)
   ========================= */
window.handleSmoothFeed = function (data) {
  hasFetchedOnce = true;

  if (dateRow) dateRow.textContent = formatDateLine();

  // If NOT live -> screensaver only (your requested behavior)
  if (!data || !data.title || !data.isLive) {
    liveSession = null;
    showScreensaver();
    return;
  }

  // LIVE -> show session UI immediately
  showSessionUI();

  if (statusPill) {
    statusPill.textContent = "In Session";
    statusPill.className = "pill live";
  }

  const firstName = extractFirstName(data.title);
  if (clientNameEl) clientNameEl.textContent = firstName;

  // Save details for ultra-smooth countdown updates
  liveSession = {
    title: data.title,
    startISO: data.startISO,
    endISO: data.endISO,
    timeRangeText: formatTimeRange(data.startISO, data.endISO),
    clientFirstName: firstName,
  };

  // Render immediately (so it updates instantly on fetch)
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

  // IMPORTANT: callback must match window.handleSmoothFeed
  s.src = `${APPS_SCRIPT_URL}?callback=handleSmoothFeed&t=${Date.now()}`;

  s.onerror = () => {
    // If feed fails:
    // - If we haven't fetched once yet, keep both hidden (no flash)
    // - After first fetch, fallback to screensaver
    if (!hasFetchedOnce) {
      hideBothUntilFirstFetch();
    } else {
      liveSession = null;
      showScreensaver();
    }
  };

  document.body.appendChild(s);
}

/* =========================
   Start
   ========================= */
if (dateRow) dateRow.textContent = formatDateLine();

// Prevent initial “screensaver flash”
hideBothUntilFirstFetch();

// Load feed immediately, then poll
loadFeed();
setInterval(loadFeed, FEED_REFRESH_MS);

// Ultra-smooth countdown ticking (local only)
setInterval(renderCountdown, UI_TICK_MS);
