// =======================================================
// Smooth Studios TV Dashboard - script.js (FINAL)
// =======================================================
// - Uses JSONP to avoid CORS issues with Apps Script
// - Shows session UI ONLY when isLive === true
// - Otherwise shows bouncing logo screensaver
// - Displays client's FIRST name only
// =======================================================

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyCW9D8uiFxeQMb5P4EDpnl-oIzwq7dIId-K91oXMUlC4nDPSvnTMtqFj03ZJ7vlsK6sA/exec";

/* =========================
   CUSTOMIZE: Refresh Rate
   ========================= */
const REFRESH_MS = 1000;

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

function formatTimeLeft(endISO) {
  const now = new Date();
  const end = new Date(endISO);
  const ms = end - now;

  if (ms <= 0) return "0:00 Left";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Customize: if you want minutes only, replace with:
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
   UI Elements
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
   Customize speeds here:
*/
let vx = 2.6; // Customize: horizontal speed
let vy = 2.2; // Customize: vertical speed
let x = 60, y = 60;

function tickScreensaver() {
  if (!screensaverEl || !ssLogo) {
    requestAnimationFrame(tickScreensaver);
    return;
  }

  // If screensaver hidden, keep the loop alive but do nothing
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
   JSONP Callback (MUST be global)
   ========================= */
window.handleSmoothFeed = function (data) {
  if (dateRow) dateRow.textContent = formatDateLine();

  // Only show UI if LIVE
  if (!data || !data.title || !data.isLive) {
    if (sessionUI) sessionUI.classList.add("hidden");
    if (screensaverEl) screensaverEl.style.display = "block";
    return;
  }

  // Live session
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

/* =========================
   JSONP Loader
   ========================= */
function loadFeed() {
  // Remove old JSONP script tag
  const old = document.getElementById("jsonp");
  if (old) old.remove();

  const s = document.createElement("script");
  s.id = "jsonp";

  // IMPORTANT: callback must match window.handleSmoothFeed
  s.src = `${APPS_SCRIPT_URL}?callback=handleSmoothFeed&t=${Date.now()}`;

  // If the request fails, default to screensaver (never stuck loading)
  s.onerror = () => {
    if (sessionUI) sessionUI.classList.add("hidden");
    if (screensaverEl) screensaverEl.style.display = "block";
  };

  document.body.appendChild(s);
}

// Start
if (dateRow) dateRow.textContent = formatDateLine();
loadFeed();
setInterval(loadFeed, REFRESH_MS);
