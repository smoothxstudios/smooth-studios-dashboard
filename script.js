// script.js (FULL) — Ultra-smooth countdown + urgent pulse <= 10:00 + no flash

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyCW9D8uiFxeQMb5P4EDpnl-oIzwq7dIId-K91oXMUlC4nDPSvnTMtqFj03ZJ7vlsK6sA/exec";

/* =========================
   Refresh Settings
   =========================
   FEED_REFRESH_MS: fetches event info from Apps Script
   UI_TICK_MS:      redraws countdown locally (smooth)
*/
const FEED_REFRESH_MS = 10000; // safe for Apps Script
const UI_TICK_MS = 100;        // smooth countdown

function pad(n) {
  return String(n).padStart(2, "0");
}

/* First name only from titles like: "Akiva Bell: Studio Rental (...)" */
function extractFirstName(eventTitle) {
  if (!eventTitle) return "";
  const beforeColon = eventTitle.split(":")[0].trim();
  return beforeColon.split(/\s+/)[0].trim() || beforeColon;
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
let liveSession = null; // { endISO, timeRangeText }

/* =========================
   Screensaver Bounce Logic
   ========================= */
let vx = 2.6;
let vy = 2.2;
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
  if (screensaverEl) screensaverEl.style.display = "none";
  if (sessionUI) sessionUI.classList.add("hidden");
}

/* =========================
   Ultra Smooth Countdown Renderer
   - Timer pulses red when <= 10:00 exactly
   ========================= */
function renderCountdown() {
  if (dateRow) dateRow.textContent = formatDateLine();

  if (!liveSession || !liveSession.endISO) return;

  const nowMs = Date.now();
  const endMs = new Date(liveSession.endISO).getTime();
  const msLeft = endMs - nowMs;

  if (msLeft <= 0) {
    liveSession = null;
    showScreensaver();
    return;
  }

  const totalSeconds = Math.floor(msLeft / 1000);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (timeRow) {
    if (totalSeconds <= 600) timeRow.classList.add("urgent");
    else timeRow.classList.remove("urgent");
  }

  const leftHTML =
    `${minutes}<span class="unit">m</span> ` +
    `${pad(seconds)}<span class="unit">s</span> Left`;

  if (timeRow) {
    timeRow.innerHTML =
      `APPOINTMENT TIME: ${liveSession.timeRangeText}  •  ${leftHTML}
