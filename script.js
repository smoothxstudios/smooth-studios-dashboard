// script.js (FULL) — Fade transitions + Next Up bubble + Ambient BG already in CSS

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyCW9D8uiFxeQMb5P4EDpnl-oIzwq7dIId-K91oXMUlC4nDPSvnTMtqFj03ZJ7vlsK6sA/exec";

const FEED_REFRESH_MS = 10000; // safe for Apps Script
const UI_TICK_MS = 100;        // smooth countdown

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

/* -----------------------
   Fade show/hide helpers
------------------------ */
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

/* -----------------------
   Screensaver bounce
------------------------ */
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

/* -----------------------
   Countdown + Next Up logic
------------------------ */
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

  // urgent <= 10:00
  if(timeRow){
    if(totalSeconds <= 600) timeRow.classList.add("urgent");
    else timeRow.classList.remove("urgent");
  }

  // countdown display
  const leftHTML =
    `${minutes}<span class="unit">m</span> ` +
    `${pad(seconds)}<span class="unit">s</span> Left`;

  if(timeRow){
    timeRow.innerHTML = `APPOINTMENT TIME: ${liveSession.timeRangeText} • ${leftHTML}`;
  }

  // NEXT UP bubble:
  // show only in last 10 mins AND only if next exists (and starts at/after current end)
  const hasNext = Boolean(liveSession.nextTitle && liveSession.nextStartISO);
  const inLastTen = totalSeconds <= 3600;

  if(hasNext && inLastTen){
    const nextName = extractFirstName(liveSession.nextTitle);
    const nextTime = formatTimeOnly(liveSession.nextStartISO);
    if(nextUpValue) nextUpValue.textContent = `${nextName} • ${nextTime}`;
    makeVisible(nextUpBubble);
  }else{
    makeHidden(nextUpBubble);
  }
}

/* -----------------------
   JSONP callback
   IMPORTANT: For "Next Up", Apps Script must return nextTitle & nextStartISO.
------------------------ */
window.handleSmoothFeed = function(data){
  hasFetchedOnce = true;

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

    // Next Up data (must be provided by Apps Script)
    nextTitle: data.nextTitle || "",
    nextStartISO: data.nextStartISO || ""
  };

  renderCountdown();
};

/* -----------------------
   JSONP loader
------------------------ */
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

/* -----------------------
   Start
------------------------ */
hideBothUntilFirstFetch();
if(dateRow) dateRow.textContent = formatDateLine();

loadFeed();
setInterval(loadFeed, FEED_REFRESH_MS);
setInterval(renderCountdown, UI_TICK_MS);
