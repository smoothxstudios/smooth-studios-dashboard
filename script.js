const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyCW9D8uiFxeQMb5P4EDpnl-oIzwq7dIId-K91oXMUlC4nDPSvnTMtqFj03ZJ7vlsK6sA/exec";

/* =========================
   Customize Refresh Interval
   =========================
   If you want the countdown smoother, lower this to 3000 (3 sec).
*/
const REFRESH_MS = 10000;

function pad(n){ return String(n).padStart(2,"0"); }

function extractFirstName(eventTitle){
  if(!eventTitle) return "";

  // Your titles: "Khari Jackson: Quick Studio Rental..."
  const beforeColon = eventTitle.split(":")[0].trim(); // "Khari Jackson"
  const firstWord = beforeColon.split(/\s+/)[0].trim(); // "Khari"
  return firstWord || beforeColon;
}

function formatTimeRange(startISO, endISO){
  const s = new Date(startISO);
  const e = new Date(endISO);
  const opts = { hour:"numeric", minute:"2-digit" };
  return `${s.toLocaleTimeString([], opts)} – ${e.toLocaleTimeString([], opts)}`;
}

function formatTimeLeft(endISO){
  const now = new Date();
  const end = new Date(endISO);
  let ms = end - now;

  if(ms <= 0) return "0:00 Left";

  const totalSeconds = Math.floor(ms/1000);
  const hours = Math.floor(totalSeconds/3600);
  const minutes = Math.floor((totalSeconds%3600)/60);
  const seconds = totalSeconds%60;

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)} Left`
    : `${minutes}:${pad(seconds)} Left`;
}

function formatDateLine(){
  const now = new Date();
  return now.toLocaleDateString([], { weekday:"long", month:"long", day:"numeric", year:"numeric" });
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
   Customize speed below:
*/
let vx = 2.6; // Customize: horizontal speed
let vy = 2.2; // Customize: vertical speed
let x = 60, y = 60;

function tickScreensaver(){
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
   JSONP Feed Loader
   ========================= */
window.handleSmoothFeed = function(data){
  dateRow.textContent = formatDateLine();

  // If not live, go to screensaver mode
  if(!data || !data.title || !data.isLive){
    sessionUI.classList.add("hidden");
    screensaverEl.style.display = "block";
    return;
  }

  // Live session mode
  screensaverEl.style.display = "none";
  sessionUI.classList.remove("hidden");

  statusPill.textContent = "In Session";
  statusPill.className = "pill live";

  const firstName = extractFirstName(data.title);
  clientNameEl.textContent = firstName;

  const timeRange = formatTimeRange(data.startISO, data.endISO);
  const timeLeft = formatTimeLeft(data.endISO);

  // Customize: change separator / wording here
  timeRow.textContent = `${timeRange}  •  ${timeLeft}`;
};

function loadFeed(){
  // Remove previous JSONP script if it exists
  const old = document.getElementById("jsonp");
  if (old) old.remove();

  const s = document.createElement("script");
  s.id = "jsonp";

  // JSONP callback + cache buster
  s.src = `${APPS_SCRIPT_URL}?callback=handleSmoothFeed&t=${Date.now()}`;

  s.onerror = () => {
    // If feed fails, default to screensaver
    sessionUI.classList.add("hidden");
    screensaverEl.style.display = "block";
  };

  document.body.appendChild(s);
}

// Start
dateRow.textContent = formatDateLine();
loadFeed();
setInterval(loadFeed, REFRESH_MS);
