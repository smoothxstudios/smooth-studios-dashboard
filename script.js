// =======================================================
// Smooth Studios TV Dashboard - script.js (UPDATED)
// =======================================================
// What this does:
// - Pulls today's bookings from your Google Apps Script feed (JSONP)
// - ONLY shows the session card when an appointment is LIVE (isLive === true)
// - Otherwise shows a bouncing-logo screensaver (burn-in safe)
// - Displays ONLY the client's first name
// - Shows time range + time left countdown during the live session
//
// Customize later:
// - REFRESH_MS (how often it polls the feed)
// - vx/vy (screensaver speed)
// - timeRow text formatting
// =======================================================

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyCW9D8uiFxeQMb5P4EDpnl-oIzwq7dIId-K91oXMUlC4nDPSvnTMtqFj03ZJ7vlsK6sA/exec";

/* =========================
   Customize Refresh Interval
   =========================
   If you want smoother countdown updates, set this to 3000.
*/
const REFRESH_MS = 10000;

function pad(n) {
  return String(n).padStart(2, "0");
}

const DEBUG = true; // turn off later
function debug(msg){
  if(!DEBUG) return;
  const el = document.getElementById("timeRow");
  if(el) el.textContent = msg;
}

/* =========================
   Client Name Parsing
   =========================
   Your titles look like:
   "Akiva Bell: Studio Rental (Smooth Studios)"
   We want: "Akiva"
*/
function extractFirstName(eventTitle) {
  if (!eventTitle) return "";
  const beforeColon = eventTitle.split(":")[0].trim(); // "Akiva Bell"
  const firstWord = beforeColon.split(/\s+/)[0].trim(); // "Akiva"
  return firstWord || beforeColon;
}

function formatTimeRange(startISO, endISO) {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const opts = { hour: "numeric", minute: "2-digit" };
  return `${s.toLocaleTimeString([], opts)} – ${e.toLocaleTimeString([], opts)}`;
}

function formatTimeLeft(endISO) {
  const now = new Date();
  const end = new Date(endISO);
  let ms = end - now;

  if (ms <= 0) return "0:00 Left";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Customize: if you only want minutes (no seconds), change return to:
  // return hours > 0 ? `${hours}:${pad(minutes)} Left` : `${minutes} Min Left`;
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)} Left`
    : `${minutes}:${pad(seconds)} Left`;
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
   UI Elements (must match index.html)
   ========================= */
const screensaverEl = document.getElementById("screensaver");
const ssLogo = document.getElementById("ssLogo");

const sessionUI = document.getElementById("sessionUI");
const statusPill = document.getElementById("statusPill");
const timeRow = document.getElementById("timeRow");
const dateRow = document.getElementById("dateRow");
const clientNameEl = document.getElementById("clientName");

/* =========================
   Screensaver Bounce Logic
   =========================
   Customize speed below:
*/
let vx = 2.6; // Customize: horizontal speed (higher = faster)
let vy = 2.2; // Customize: vertical speed (higher = faster)
let x = 60,
  y = 60;

function tickScreensaver() {
  // If screensaver hidden, keep loop alive but do nothing
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

  if (x <= 0) {
    x = 0;
    vx *= -1;
  }
  if (y <= 0) {
    y = 0;
    vy *= -1;
  }
  if (x + lw >= w) {
    x = w - lw;
    vx *= -1;
  }
  if (y + lh >= h) {
    y = h - lh;
    vy *= -1;
  }

  ssLogo.style.transform = `translate(${x}px, ${y}px)`;
  requestAnimationFrame(tickScreensaver);
}
requestAnimationFrame(tickScreensaver);

/* =========================
   JSONP Feed Loader
   =========================
   Apps Script returns JSON OR JSONP when callback is provided.
*/
window.handleSmoothFeed = function (data) {
  // Always show date line (even on screensaver)
  if (dateRow) dateRow.textContent = formatDateLine();

  // NOT LIVE? -> screensaver only (behavior you requested)
  if (!data || !data.title || !data.isLive) {
    if (sessionUI) sessionUI.classList.add("hidden");
    if (screensaverEl) screensaverEl.style.display = "block";
    return;
  }

  // LIVE -> show session UI
  if (screensaverEl) screensaverEl.style.display = "none";
  if (sessionUI) sessionUI.classList.remove("hidden");

  if (statusPill) {
    statusPill.textContent = "In Session";
    statusPill.className = "pill live";
  }

  const firstName = extractFirstName(data.title);
  if (clientNameEl) clientNameEl.textContent = firstName;

  const timeRange = formatTimeRange(data.startISO, data.endISO);
  const timeLeft = formatTimeLeft(data.endISO);

  // Customize: change separators/wording here
  if (timeRow) timeRow.textContent = `${timeRange}  •  ${timeLeft}`;
};

function loadFeed() {
  const old = document.getElementById("jsonp");
  if (old) old.remove();

  const s = document.createElement("script");
  s.id = "jsonp";

  // callback name must match window.handleSmoothFeed
  s.src = `${APPS_SCRIPT_URL}?callback=handleSmoothFeed&t=${Date.now()}`;

  s.onerror = () => {
    // If feed fails, default to screensaver
    if (sessionUI) sessionUI.classList.add("hidden");
    if (screensaverEl) screensaverEl.style.display = "block";
  };

  document.body.appendChild(s);
}

// Start
if (dateRow) dateRow.textContent = formatDateLine();
loadFeed();
setInterval(loadFeed, REFRESH_MS);
