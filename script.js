const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyCW9D8uiFxeQMb5P4EDpnl-oIzwq7dIId-K91oXMUlC4nDPSvnTMtqFj03ZJ7vlsK6sA/exec";

const FEED_REFRESH_MS = 10000;
const UI_TICK_MS = 100;

const screensaverEl = document.getElementById("screensaver");
const ssLogo = document.getElementById("ssLogo");
const sessionUI = document.getElementById("sessionUI");
const timeRow = document.getElementById("timeRow");
const dateRow = document.getElementById("dateRow");
const clientNameEl = document.getElementById("clientName");

let hasFetchedOnce = false;
let liveSession = null;

function extractFirstName(title){
  return title?.split(":")[0]?.split(" ")[0]?.toUpperCase() || "";
}

function formatTimeRange(s,e){
  const o={hour:"numeric",minute:"2-digit"};
  return `${new Date(s).toLocaleTimeString([],o)} – ${new Date(e).toLocaleTimeString([],o)}`;
}

function formatDate(){
  return new Date().toLocaleDateString([],{
    weekday:"long",month:"long",day:"numeric",year:"numeric"
  });
}

function render(){
  if(!liveSession) return;
  const left=Math.floor((new Date(liveSession.end)-Date.now())/1000);
  if(left<=0){ liveSession=null; showScreensaver(); return; }

  const m=Math.floor(left/60), s=left%60;
  timeRow.innerHTML=`APPOINTMENT TIME: ${liveSession.range} • ${m}<span class="unit">m</span> ${String(s).padStart(2,"0")}<span class="unit">s</span> Left`;
  timeRow.classList.toggle("urgent",left<=600);
  dateRow.textContent=formatDate();
}

function showScreensaver(){
  sessionUI.classList.add("hidden");
  screensaverEl.style.display="block";
}

function showSession(){
  screensaverEl.style.display="none";
  sessionUI.classList.remove("hidden");
}

window.handleSmoothFeed=data=>{
  hasFetchedOnce=true;
  if(!data?.isLive){ liveSession=null; showScreensaver(); return; }

  showSession();
  clientNameEl.textContent=extractFirstName(data.title);
  liveSession={ end:data.endISO, range:formatTimeRange(data.startISO,data.endISO) };
  render();
};

function load(){
  document.getElementById("jsonp")?.remove();
  const s=document.createElement("script");
  s.id="jsonp";
  s.src=`${APPS_SCRIPT_URL}?callback=handleSmoothFeed&t=${Date.now()}`;
  document.body.appendChild(s);
}

showScreensaver();
load();
setInterval(load,FEED_REFRESH_MS);
setInterval(render,UI_TICK_MS);
