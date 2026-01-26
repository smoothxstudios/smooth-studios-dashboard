const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyCW9D8uiFxeQMb5P4EDpnl-oIzwq7dIId-K91oXMUlC4nDPSvnTMtqFj03ZJ7vlsK6sA/exec";

function pad(n){ return String(n).padStart(2,"0"); }

function extractFirstName(eventTitle){
  if(!eventTitle) return "";
  const firstChunk = eventTitle.split(/:|\s[-–—]\s/)[0].trim(); // before ":" or " - "
  const firstWord = firstChunk.split(/\s+/)[0].trim();
  return firstWord || firstChunk;
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
  const opts = { weekday:"long", month:"long", day:"numeric", year:"numeric" };
  return now.toLocaleDateString([], opts);
}

async function refresh(){
  const lineEl = document.getElementById("line");
  const timeRow = document.getElementById("timeRow");
  const dateRow = document.getElementById("dateRow");
  const pill = document.getElementById("statusPill");

  dateRow.textContent = formatDateLine();

  try{
    const res = await fetch(APPS_SCRIPT_URL, { cache:"no-store" });
    const data = await res.json();

    if(!data.title){
      lineEl.textContent = "Welcome To Smooth Studios";
      timeRow.textContent = "No More Bookings Scheduled Today";
      pill.textContent = "Closed / No Sessions";
      pill.className = "pill next";
      return;
    }

    const firstName = extractFirstName(data.title);
    const timeRange = formatTimeRange(data.startISO, data.endISO);

    lineEl.textContent = `Welcome To Smooth Studios "${firstName}"`;

    if(data.isLive){
      pill.textContent = "In Session";
      pill.className = "pill live";
      timeRow.textContent = `${timeRange}  •  ${formatTimeLeft(data.endISO)}`;
    }else{
      pill.textContent = "Up Next";
      pill.className = "pill next";
      timeRow.textContent = `${timeRange}`;
    }

  }catch(e){
    lineEl.textContent = "Welcome To Smooth Studios";
    timeRow.textContent = "Connecting…";
    pill.textContent = "Connecting";
    pill.className = "pill next";
  }
}

refresh();
setInterval(refresh, 10000);
