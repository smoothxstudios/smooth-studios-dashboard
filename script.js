const TIMEZONE = "America/New_York";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyCW9D8uiFxeQMb5P4EDpnl-oIzwq7dIId-K91oXMUlC4nDPSvnTMtqFj03ZJ7vlsK6sA/exec";

function pad(n) { return String(n).padStart(2, "0"); }

function extractFirstName(eventTitle) {
  if (!eventTitle) return "";
  // Example: "Jasmine - Studio Rental"
  const leftSide = eventTitle.split(/\s[-–—]\s/)[0].trim(); // "Jasmine"
  const firstWord = leftSide.split(/\s+/)[0].trim();        // first name only
  return firstWord || leftSide;
}


function formatTimeRange(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const opts = { hour: "numeric", minute: "2-digit" };
  return `${s.toLocaleTimeString([], opts)} – ${e.toLocaleTimeString([], opts)}`;
}

function formatTimeLeft(endISO) {
  const now = new Date(
  Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss")
);
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

    const displayName = extractFirstName(data.title);
    const timeRange = formatTimeRange(data.startISO, data.endISO);
    const timeLeft = formatTimeLeft(data.endISO);

    // Exact format you requested:
    // Welcome To Smooth Studios "Person/Organization Name" - Booking Time - amount of booking time left
    lineEl.textContent = `Welcome To Smooth Studios "${displayName}"`;
    subEl.textContent = `${timeRange} - ${timeLeft}${data.isLive ? "" : " - Up Next"}`;
  } catch (e) {
    document.getElementById("line").textContent = "Welcome To Smooth Studios";
    document.getElementById("sub").textContent = "Connecting…";
  }
}

// Updates the “time left” in real time
refresh();
setInterval(refresh, 10000);
