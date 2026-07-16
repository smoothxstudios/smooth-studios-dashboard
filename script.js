// script.js (FULL)
// Ambient background motion + subtle grain + sync background to session urgency + Next Up bubble + fades + screensaver bounce

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyCW9D8uiFxeQMb5P4EDpnl-oIzwq7dIId-K91oXMUlC4nDPSvnTMtqFj03ZJ7vlsK6sA/exec";

const FEED_REFRESH_MS = 15000; // Apps Script friendly
const UI_TICK_MS = 1000;        // smooth countdown

// Elements
const screensaverEl = document.getElementById("screensaver");
const ssLogo = document.getElementById("ssLogo");

const sessionUI = document.getElementById("sessionUI");
const timeRow = document.getElementById("timeRow");
const dateRow = document.getElementById("dateRow");
const clientNameEl = document.getElementById("clientName");

const nextUpBubble = document.getElementById("nextUpBubble");
const nextUpValue = document.getElementById("nextUpValue");

// State
let hasFetchedOnce = false;
let liveSession = null; // { endISO, timeRangeText, nextTitle, nextStartISO }

// ---------- Helpers ----------
function pad(n){ return String(n).padStart(2,"0"); }

function extractFirstName(title){
  if(!title) return "";
  const beforeColon = title.split(":")[0].trim();
  return (beforeColon.split(/\s+/)[0].trim() || beforeColon).toUpperCase();
}

function formatTimeRange(startISO, endISO){
  const s = new Date(startISO);
  const e = new Date(endISO);
  const opts = { hour:"numeric", minute:"2-digit" };
  return `${s.toLocaleTimeString([], opts)} – ${e.toLocaleTimeString([], opts)}`;
}

function formatDateLine(){
  return new Date().toLocaleDateString([],{
    weekday:"long", month:"long", day:"numeric", year:"numeric"
  });
}

function formatTimeOnly(iso){
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour:"numeric", minute:"2-digit" });
}

// ---------- Fade helpers ----------
function makeVisible(el){
  if(!el) return;
  el.classList.remove("isHidden");
  el.classList.add("isVisible");
}

function makeHidden(el){
  if(!el) return;
  el.classList.remove("isVisible");
  el.classList.add("isHidden");
}

function showScreensaver(){
  makeHidden(sessionUI);
  makeHidden(nextUpBubble);
  makeVisible(screensaverEl);

  // Calm background when idle (customize)
  setBackgroundUrgency(null);
}

function showSessionUI(){
  makeHidden(screensaverEl);
  makeVisible(sessionUI);
}

function hideBothUntilFirstFetch(){
  makeHidden(screensaverEl);
  makeHidden(sessionUI);
  makeHidden(nextUpBubble);
}

// ---------- Background urgency sync ----------
/**
 * Syncs background motion + red tint to time left.
 * - Calm: slow drift + no red wash
 * - Urgent (<=10 mins): faster drift + red wash ramps up
 *
 * Customize here:
 * - maxRedWash: how red it gets near 0
 * - calmDur / urgentDur: drift speed
 */
function setBackgroundUrgency(secondsLeft){
  const root = document.documentElement;

  const calmDur = 34;     // seconds
  const urgentDur = 14;   // seconds (faster drift)
  const maxRedWash = 0.38; // 0.00–0.55 recommended

  // No session / screensaver
  if(secondsLeft === null || secondsLeft === undefined){
    root.style.setProperty("--bgAnimDur", `${calmDur}s`);
    root.style.setProperty("--bgRedWash", `0`);
    return;
  }

  // > 10 min: calm
  if(secondsLeft > 600){
    root.style.setProperty("--bgAnimDur", `${calmDur}s`);
    root.style.setProperty("--bgRedWash", `0`);
    return;
  }

  // <= 10 min: ramp from calm → urgent
  // t = 0 at 10min, t = 1 at 0min
  const t = Math.min(1, Math.max(0, (600 - secondsLeft) / 600));

  // Drift speed ramps down (calmDur → urgentDur)
  const dur = calmDur - (calmDur - urgentDur) * t;

  // Red wash ramps up smoothly
  const red = maxRedWash * (t * t); // quadratic easing (soft early, stronger late)

  root.style.setProperty("--bgAnimDur", `${dur.toFixed(2)}s`);
  root.style.setProperty("--bgRedWash", `${red.toFixed(3)}`);
}

// ---------- Screensaver bounce ----------
let x = 60, y = 60;
let vx = 2.6, vy = 2.2;

function animateScreensaver(){
  requestAnimationFrame(animateScreensaver);

  if(!screensaverEl || !ssLogo) return;

  const visible = screensaverEl.classList.contains("isVisible");
  if(!visible) return;

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
}
requestAnimationFrame(animateScreensaver);

// ---------- UI render ----------
function renderCountdown(){
  if(dateRow) dateRow.textContent = formatDateLine();
  if(!liveSession?.endISO) return;

  const nowMs = Date.now();
  const endMs = new Date(liveSession.endISO).getTime();
  const msLeft = endMs - nowMs;

  if(msLeft <= 0){
    liveSession = null;
    showScreensaver();
    return;
  }

  const totalSeconds = Math.floor(msLeft / 1000);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Sync background to urgency
  setBackgroundUrgency(totalSeconds);

  // urgent timer <= 10:00
  if(timeRow){
    if(totalSeconds <= 600) timeRow.classList.add("urgent");
    else timeRow.classList.remove("urgent");
  }

  const leftHTML =
    `${minutes}<span class="unit">m</span> ` +
    `${pad(seconds)}<span class="unit">s</span> Left`;

  if(timeRow){
    timeRow.innerHTML = `APPOINTMENT TIME: ${liveSession.timeRangeText} • ${leftHTML}`;
  }

  // Next Up bubble: show only in last 10 mins AND if next exists
  const hasNext = Boolean(liveSession.nextTitle && liveSession.nextStartISO);
  const inLastTen = totalSeconds <= 600;

  if(hasNext && inLastTen){
    const nextName = extractFirstName(liveSession.nextTitle);
    const nextTime = formatTimeOnly(liveSession.nextStartISO);
    if(nextUpValue) nextUpValue.textContent = `${nextName} • ${nextTime}`;
    makeVisible(nextUpBubble);
  }else{
    makeHidden(nextUpBubble);
  }
}

// ---------- JSONP callback ----------
window.handleSmoothFeed = function(data){
  hasFetchedOnce = true;

  // No live session
  if(!data || !data.isLive || !data.title){
    liveSession = null;
    showScreensaver();
    return;
  }

  showSessionUI();

  if(clientNameEl) clientNameEl.textContent = extractFirstName(data.title);

  liveSession = {
    endISO: data.endISO,
    timeRangeText: formatTimeRange(data.startISO, data.endISO),
    nextTitle: data.nextTitle || "",
    nextStartISO: data.nextStartISO || ""
  };

  renderCountdown();
};

// ---------- JSONP loader ----------
function loadFeed(){
  const old = document.getElementById("jsonp");
  if(old) old.remove();

  const s = document.createElement("script");
  s.id = "jsonp";
  s.src = `${APPS_SCRIPT_URL}?callback=handleSmoothFeed&t=${Date.now()}`;

  s.onerror = () => {
    if(!hasFetchedOnce) hideBothUntilFirstFetch();
    else showScreensaver();
  };

  document.body.appendChild(s);
}

// ---------- Start ----------
hideBothUntilFirstFetch();
if(dateRow) dateRow.textContent = formatDateLine();

// Start calm until a session is live
setBackgroundUrgency(null);

loadFeed();
setInterval(loadFeed, FEED_REFRESH_MS);
setInterval(renderCountdown, UI_TICK_MS);
