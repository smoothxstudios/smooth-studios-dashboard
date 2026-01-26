const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyCW9D8uiFxeQMb5P4EDpnl-oIzwq7dIId-K91oXMUlC4nDPSvnTMtqFj03ZJ7vlsK6sA/exec";

function pad(n) { return String(n).padStart(2, "0"); }

function formatTimeRange(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const opts = { hour: "numeric", minute: "2-digit" };
  return `${s.toLocaleTimeString([], opts)} – ${e.toLocaleTimeString([], opts)}`;
}

function formatTimeLeft(endISO) {
  const now = new Date();
  const end = new Date(endISO);
  let ms = end - now;

  if (ms <= 0) return "0:00 Left";

  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours}:${pad(minutes)} Left` : `${minutes} Min Left`;
}

async function refresh() {
  try {
    const res = await fetch(APPS_SCRIPT_URL, { cache: "no-store" });
    const data = await res.json();

    const lineEl = document.getElementById("line");
    const subEl = document.getElementById("sub");

    if (!data.title) {
      lineEl.textContent = "Welcome To Smooth Studios";
      subEl.textContent = "No More Bookings Scheduled Today";
      return;
    }

    const timeRange = formatTimeRange(data.startISO, data.endISO);
    const timeLeft = formatTimeLeft(data.endISO);

    // Main line exactly how you asked, but readable on TV:
    lineEl.textContent = `Welcome To Smooth Studios — ${data.title}`;
    subEl.textContent = `${timeRange} — ${timeLeft}${data.isLive ? " — In Session" : ""}`;
  } catch (e) {
    document.getElementById("line").textContent = "Welcome To Smooth Studios";
    document.getElementById("sub").textContent = "Connecting…";
  }
}

// Update every 10 seconds so “time left” feels live
refresh();
setInterval(refresh, 10000);
