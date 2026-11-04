// Time-zone helpers. The database stores UTC; every screen shows the viewer's own
// time zone (profiles.timezone). Dates in URLs are plain "YYYY-MM-DD" strings
// interpreted in the viewer's time zone.

export type DateStr = string; // "YYYY-MM-DD"

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(date: Date, tz: string): Parts {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: WEEKDAYS[p.weekday],
  };
}

// Wall-clock time in a time zone -> the UTC instant. Iterates twice so it is
// correct across daylight-saving changes.
export function zonedToUtc(date: DateStr, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wanted = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wanted - asUtc;
  }
  return new Date(guess);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateStr(date: Date, tz: string): DateStr {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function toTimeStr(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function todayStr(tz: string): DateStr {
  return toDateStr(new Date(), tz);
}

export function isDateStr(s: string | undefined | null): s is DateStr {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}

export function addDays(date: DateStr, n: number): DateStr {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonths(date: DateStr, n: number): DateStr {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(date: DateStr) {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

// Weeks start on Monday.
export function startOfWeek(date: DateStr): DateStr {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

export function startOfMonth(date: DateStr): DateStr {
  return date.slice(0, 8) + "01";
}

export function formatDay(date: DateStr, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

export function formatDateTime(iso: string, tz: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...opts,
  });
}

export function formatTime(iso: string, tz: string) {
  return toTimeStr(new Date(iso), tz);
}

export function minutesBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 60000);
}

export function tzLabel(tz: string) {
  return tz.replace(/_/g, " ");
}
