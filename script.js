const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyCW9D8uiFxeQMb5P4EDpnl-oIzwq7dIId-K91oXMUlC4nDPSvnTMtqFj03ZJ7vlsK6sA/exec";

function pad(n) { return String(n).padStart(2, "0"); }

// Title examples you showed:
// "Khari Jackson: Quick Studio Rental (Smooth Studios), 2pm, Smooth Studios"
// We want ONLY first name: "Khari"
function extractFirstName(eventTitle) {
  if (!eventTitle) return "";

  // Take the first chunk before ":" OR " - " OR " – " OR " — "
  // This handles titles like:
  // "Khari Jackson: Quick Studio Rental..."
  // "Jasmine - Studio Rental"
  const firstChunk = eventTitle.split(/:|\s[-–—]\s/)[0].trim();

  // First word only
  const firstWord = firstChunk.split(/\s+/)[0].trim();

  return firstWord || firstChunk;
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
  let ms = end - now;

  if (ms <= 0) return "0:00 Left";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // If you prefer minutes only, tell me and I’ll simplify it.
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)} Left`
    : `${minutes}:${pad(seconds)} Left`;
}

async function refresh() {
  const lineEl = document.getElementById("line");
  const subEl = document.getElementById("sub");

  try {
    const res = await fetch(APPS_SCRIPT_URL, { cache: "no-store" });
    const data = await res.json();

    if (!data.title) {
      lineEl.textContent = "Welcome To Smooth Studios";
      subEl.textContent = "No More Bookings Scheduled Today";
      return;
    }

    const firstName = extractFirstName(data.title);
    const timeRange = formatTimeRange(data.startISO, data.endISO);

    // Only show countdown when LIVE
    if (data.isLive) {
      const timeLeft = formatTimeLeft(data.endISO);
      lineEl.textContent = `Welcome To Smooth Studios "${firstName}"`;
      subEl.textContent = `${timeRange} - ${timeLeft}`;
    } else {
      lineEl.textContent = `Welcome To Smooth Studios "${firstName}"`;
      subEl.textContent = `${timeRange} - Up Next`;
    }
  } catch (e) {
    lineEl.textContent = "Welcome To Smooth Studios";
    subEl.textContent = "Connecting…";
  }
}

// Refresh often so countdown feels live
refresh();
setInterval(refresh, 10000);
