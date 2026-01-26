// script.js (FULL) — Screensaver bounce + live session display

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyCW9D8uiFxeQMb5P4EDpnl-oIzwq7dIId-K91oXMUlC4nDPSvnTMtqFj03ZJ7vlsK6sA/exec";

// How often we fetch from Google (safe)
const FEED_REFRESH_MS = 10000;

// How often we update the countdown locally (smooth)
const UI_TICK_MS = 100;

// ============================
// Elements
// ============================
const screensaverEl = document.getElementById("screensaver");
const ssLogo = document.getElementById("ssLogo");

const sessionUI = document.getElementById("sessionUI");
const timeRow = document.getElementById("timeRow");
const dateRow = document.getElementById("dateRow");
const clientNameEl = document.getElementById("clientName");

// ============================
// State
// ============================
let hasFetchedOnce = false;
let liveSession = null; // { endISO, timeRangeText }

// ============================
// Helpers
// ============================
function pad(n) {
  return String(n).padStart(2, "0");
}

function extractFirstName(title) {
  if (!title) return "";
  const beforeColon = title.split(":")[0].trim(); // "Akiva Bell"
  return (beforeColon.split(/\s+/)[0].trim() || beforeColon).toUpperCase();
}

function formatTimeRange(startISO, endISO) {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const opts = { hour: "numeric", minute: "2-digit" };
  return `${s.toLocaleTimeString([], opts)} – ${e.toLocaleTimeString([], opts)}`;
}

function formatDateLine() {
  return new Date().toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ============================
// Mode switching
// ============================
function showScreensaver() {
  if (sessionUI) sessionUI.classList.add("hidden");
  if (screensaverEl) screensaverEl.style.display = "block";
}

function showSessionUI() {
  if (screensaverEl) screensaverEl.style.display = "none";
  if (sessionUI) sessionUI.classList.remove("hidden");
}

// Prevent flash
function hideBothUntilFirstFetch() {
  if (screensaverEl) screensaverEl.style.display = "none";
  if (sessionUI) sessionUI.classList.add("hidden");
}

// ============================
// Countdown render (smooth)
// ============================
function renderCountdown() {
  if (dateRow) dateRow.textContent = formatDateLine();
  if (!liveSession || !liveSession.endISO) return;

  const now = Date.now();
  const end = new Date(liveSession.endISO).getTime();
  const msLeft = end - now;

  if (msLeft <= 0) {
    liveSession = null;
    showScreensaver();
    return;
  }

  const totalSeconds = Math.floor(msLeft / 1000);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // urgent when <= 10:00 exactly
  if (timeRow) {
    if (totalSeconds <= 600) timeRow.classList.add("urgent");
    else timeRow.classList.remove("urgent");
  }

  const leftHTML =
    `${minutes}<span class="unit">m</span> ` +
    `${pad(seconds)}<span class="unit">s</span> Left`;

  if (timeRow) {
    timeRow.innerHTML = `APPOINTMENT TIME: ${liveSession.timeRangeText} • ${leftHTML}`;
  }
}

// ============================
// JSONP callback (global)
// ============================
window.handleSmoothFeed = function (data) {
  hasFetchedOnce = true;

  // no live event -> screensaver
  if (!data || !data.isLive || !data.title) {
    liveSession = null;
    showScreensaver();
    return;
  }

  // live event -> session UI
  showSessionUI();

  if (clientNameEl) clientNameEl.textContent = extractFirstName(data.title);

  liveSession = {
    endISO: data.endISO,
    timeRangeText: formatTimeRange(data.startISO, data.endISO),
  };

  renderCountdown();
};

// ============================
// JSONP loader
// ============================
function loadFeed() {
  const old = document.getElementById("jsonp");
  if (old) old.remove();

  const s = document.createElement("script");
  s.id = "jsonp";
  s.src = `${APPS_SCRIPT_URL}?callback=handleSmoothFeed&t=${Date.now()}`;

  s.onerror = () => {
    if (!hasFetchedOnce) hideBothUntilFirstFetch();
    else showScreensaver();
  };

  document.body.appendChild(s);
}

// ============================
// Screensaver Bounce (FIXED)
// ============================
// NOTE: We keep this animation loop running always,
// but it only MOVES when screensaver is visible.

let x = 60, y = 60;
let vx = 2.6, vy = 2.2;

function animateScreensaver() {
  requestAnimationFrame(animateScreensaver);

  if (!screensaverEl || !ssLogo) return;

  // Only move when screensaver is visible
  const visible = screensaverEl.style.display !== "none";
  if (!visible) return;

  const w = window.innerWidth;
  const h = window.innerHeight;

  // Ensure we have logo size (after it loads)
  const rect = ssLogo.getBoundingClientRect();
  const lw = rect.width || 220;
  const lh = rect.height || 220;

  x += vx;
  y += vy;

  if (x <= 0) { x = 0; vx *= -1; }
  if (y <= 0) { y = 0; vy *= -1; }
  if (x + lw >= w) { x = w - lw; vx *= -1; }
  if (y + lh >= h) { y = h - lh; vy *= -1; }

  // Make sure the logo can actually move:
  // position is absolute in CSS, and we animate via transform.
  ssLogo.style.transform = `translate(${x}px, ${y}px)`;
}

// Start animation loop after logo loads (safe)
if (ssLogo) {
  ssLogo.addEventListener("load", () => {
    // set starting transform
    ssLogo.style.transform = `translate(${x}px, ${y}px)`;
  });
}
requestAnimationFrame(animateScreensaver);

// ============================
// Start
// ============================
hideBothUntilFirstFetch();
if (dateRow) dateRow.textContent = formatDateLine();

loadFeed();
setInterval(loadFeed, FEED_REFRESH_MS);
setInterval(renderCountdown, UI_TICK_MS);
