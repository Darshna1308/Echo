/*
  Date helpers. Memory dates are calendar days ("2024-10-09") with no time
  zone, so they're always formatted in UTC to avoid showing the wrong day.
*/
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parseDay(value) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDay(value, { weekday = false } = {}) {
  const d = parseDay(value);
  if (!d) return "";
  return d.toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(weekday ? { weekday: "long" } : {}),
  });
}

export function formatShortDay(value) {
  const d = parseDay(value);
  if (!d) return "";
  return d.toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}

export function dayAndMonth(value) {
  const d = parseDay(value);
  if (!d) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function yearOf(value) {
  return parseDay(value)?.getUTCFullYear() ?? "";
}

export function monthName(index) {
  return MONTHS[index] || "";
}

export function monthKey(value) {
  const d = parseDay(value);
  return d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}` : "";
}

/* The user's own calendar date, in their time zone, as YYYY-MM-DD. */
export function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function formatTime(value) {
  if (!value) return "";
  const [h, m] = value.split(":").map(Number);
  const d = new Date(Date.UTC(2000, 0, 1, h, m));
  return d.toLocaleTimeString("en-IN", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
}

/* A point in time (not a calendar day), shown in the user's own time zone. */
export function formatMoment(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function timeUntil(value) {
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return "ready to open";
  const days = Math.floor(ms / 86400000);
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return `opens in ${plural(years, "year")}`;
  }
  if (days >= 60) return `opens in ${plural(Math.round(days / 30), "month")}`;
  if (days >= 1) return `opens in ${plural(days, "day")}`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `opens in ${plural(hours, "hour")}`;
  return `opens in ${plural(Math.max(1, Math.ceil(ms / 60000)), "minute")}`;
}

/* Stable small integer from a string (for picking a pattern colour). */
export function hashIndex(value, modulo) {
  let h = 0;
  for (const ch of String(value)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % modulo;
}
