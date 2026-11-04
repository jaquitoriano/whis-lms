import Link from "next/link";
import {
  addDays,
  addMonths,
  formatDay,
  formatTime,
  isDateStr,
  startOfMonth,
  startOfWeek,
  toDateStr,
  todayStr,
  tzLabel,
  weekdayOf,
  zonedToUtc,
  type DateStr,
} from "@/lib/time";
import { classPath, counterpart, statusLabel, statusStyle, type SessionRow } from "@/lib/sessions";
import type { Role } from "@/lib/types";

export type CalendarView = "month" | "week" | "day";
export type Availability = { weekday: number; start_time: string; end_time: string };
export type Blackout = { id: string; starts_at: string; ends_at: string; reason: string };

export function parseCalendarParams(sp: { view?: string; date?: string }, tz: string) {
  const view: CalendarView = sp.view === "month" || sp.view === "day" ? sp.view : "week";
  const date: DateStr = isDateStr(sp.date) ? sp.date : todayStr(tz);
  return { view, date };
}

// The days a view shows and the UTC range to load sessions for.
export function calendarRange(view: CalendarView, date: DateStr, tz: string) {
  let first: DateStr;
  let count: number;
  if (view === "month") {
    first = startOfWeek(startOfMonth(date));
    count = 42;
  } else if (view === "week") {
    first = startOfWeek(date);
    count = 7;
  } else {
    first = date;
    count = 1;
  }
  const days = Array.from({ length: count }, (_, i) => addDays(first, i));
  return { days, from: zonedToUtc(first, "00:00", tz), to: zonedToUtc(addDays(first, count), "00:00", tz) };
}

function navDate(view: CalendarView, date: DateStr, dir: -1 | 1) {
  if (view === "month") return addMonths(date, dir);
  return addDays(date, view === "week" ? 7 * dir : dir);
}

function title(view: CalendarView, date: DateStr, days: DateStr[]) {
  if (view === "month") return formatDay(date, { month: "long", year: "numeric" });
  if (view === "day") return formatDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${formatDay(days[0], { day: "numeric", month: "short" })} – ${formatDay(days[6], { day: "numeric", month: "short", year: "numeric" })}`;
}

function Chip({ s, viewer, tz, compact }: { s: SessionRow; viewer: Role; tz: string; compact?: boolean }) {
  return (
    <Link
      href={classPath(viewer, s.id)}
      className={`block rounded-md border px-2 py-1 text-xs hover:ring-2 hover:ring-brand-100 ${statusStyle[s.status]}`}
      title={`${statusLabel[s.status]} · ${counterpart(s, viewer)}`}
    >
      <span className="font-medium">{formatTime(s.starts_at, tz)}</span> <span className="truncate">{counterpart(s, viewer)}</span>
      {!compact && (
        <span className="block truncate opacity-80">
          {s.course?.name ?? "Class"} · {statusLabel[s.status]}
        </span>
      )}
    </Link>
  );
}

export function Calendar({
  sessions,
  view,
  date,
  tz,
  viewer,
  basePath,
  query = {},
  availability,
  blackouts,
  newHref,
}: {
  sessions: SessionRow[];
  view: CalendarView;
  date: DateStr;
  tz: string;
  viewer: Role;
  basePath: string;
  query?: Record<string, string | undefined>;
  availability?: Availability[];
  blackouts?: Blackout[];
  newHref?: (day: DateStr) => string;
}) {
  const { days } = calendarRange(view, date, tz);
  const today = todayStr(tz);
  const byDay = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const k = toDateStr(new Date(s.starts_at), tz);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const href = (v: CalendarView, d: DateStr) => {
    const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(query).filter(([, x]) => x)), view: v, date: d } as Record<string, string>);
    return `${basePath}?${q}`;
  };
  const avFor = (d: DateStr) => (availability ?? []).filter((a) => a.weekday === weekdayOf(d));
  const blFor = (d: DateStr) =>
    (blackouts ?? []).filter((b) => toDateStr(new Date(b.starts_at), tz) <= d && d <= toDateStr(new Date(Date.parse(b.ends_at) - 1), tz));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={href(view, navDate(view, date, -1))} className="btn-secondary px-3" aria-label="Previous">
            ‹
          </Link>
          <Link href={href(view, today)} className="btn-secondary">
            Today
          </Link>
          <Link href={href(view, navDate(view, date, 1))} className="btn-secondary px-3" aria-label="Next">
            ›
          </Link>
          <h2 className="ml-2 text-lg font-semibold">{title(view, date, days)}</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted sm:inline">Times in {tzLabel(tz)}</span>
          <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Calendar view">
            {(["day", "week", "month"] as const).map((v) => (
              <Link
                key={v}
                href={href(v, date)}
                aria-current={v === view ? "page" : undefined}
                className={`px-3 py-1.5 text-sm capitalize ${v === view ? "bg-brand-600 text-white" : "bg-surface hover:bg-slate-50"}`}
              >
                {v}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {view === "month" && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-muted">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const inMonth = d.slice(0, 7) === date.slice(0, 7);
              const items = byDay.get(d) ?? [];
              return (
                <div key={d} className={`min-h-24 border-b border-r border-border p-1 ${inMonth ? "" : "bg-slate-50/60"}`}>
                  <Link
                    href={href("day", d)}
                    className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${d === today ? "bg-brand-600 font-semibold text-white" : inMonth ? "" : "text-slate-400"}`}
                  >
                    {Number(d.slice(8))}
                  </Link>
                  <div className="space-y-1">
                    {items.slice(0, 3).map((s) => (
                      <Chip key={s.id} s={s} viewer={viewer} tz={tz} compact />
                    ))}
                    {items.length > 3 && (
                      <Link href={href("day", d)} className="block px-1 text-xs text-brand-700">
                        +{items.length - 3} more
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view !== "month" && (
        <div className={`grid gap-3 ${view === "week" ? "md:grid-cols-7" : ""}`}>
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            const av = avFor(d);
            const bl = blFor(d);
            return (
              <div key={d} className={`rounded-xl border bg-surface p-2 ${d === today ? "border-brand-500" : "border-border"}`}>
                <div className="mb-2 flex items-center justify-between">
                  <Link href={href("day", d)} className={`text-sm font-medium ${d === today ? "text-brand-700" : ""}`}>
                    {formatDay(d)}
                  </Link>
                  {newHref && (
                    <Link href={newHref(d)} className="rounded px-1.5 text-sm text-brand-700 hover:bg-brand-50" aria-label={`Add class on ${d}`}>
                      +
                    </Link>
                  )}
                </div>
                {availability && (
                  <p className="mb-2 text-[11px] text-muted">
                    {bl.length > 0 ? (
                      <span className="text-red-700">Blocked{bl[0].reason ? `: ${bl[0].reason}` : ""}</span>
                    ) : av.length ? (
                      <>Available {av.map((a) => `${a.start_time.slice(0, 5)}–${a.end_time.slice(0, 5)}`).join(", ")}</>
                    ) : (
                      "Not available"
                    )}
                  </p>
                )}
                <div className="space-y-1.5">
                  {items.length === 0 && view === "day" && <p className="text-sm text-muted">No classes.</p>}
                  {items.map((s) => (
                    <Chip key={s.id} s={s} viewer={viewer} tz={tz} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
