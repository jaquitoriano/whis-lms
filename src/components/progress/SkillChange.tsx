import { SKILLS, cefrLabel, type ProgressReport } from "@/lib/progress-shared";

// Dumbbell chart: each skill's level in this report against the previous one, on the CEFR scale
// (one hue, two shades: light for the previous report, strong for this one). Every value is also
// written at the end of its row, so nothing depends on colour or hovering.
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const PREV = "#86b6ef";
const NOW = "var(--brand-600)";

export function SkillChange({ report, previous }: { report: ProgressReport; previous?: ProgressReport | null }) {
  const rows = SKILLS.map((s) => ({ ...s, now: report[s.key], prev: previous?.[s.key] ?? null })).filter((r) => r.now !== null || r.prev !== null);
  if (rows.length === 0) return null;
  const pos = (v: number) => `${((v - 1) / 5) * 100}%`;

  return (
    <figure>
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: NOW }} /> This report
        </span>
        {previous && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PREV }} /> Previous report
          </span>
        )}
      </figcaption>
      <div className="grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-x-3 text-sm sm:grid-cols-[8rem_1fr_6.5rem]">
        <span />
        <div className="relative h-4 text-[11px] text-muted" aria-hidden>
          {LEVELS.map((l, i) => (
            <span key={l} className="absolute -translate-x-1/2" style={{ left: pos(i + 1) }}>
              {l}
            </span>
          ))}
        </div>
        <span />
        {rows.map((r) => {
          const [a, b] = [r.prev, r.now].map((v) => (v === null ? null : Number(v)));
          const lo = a !== null && b !== null ? Math.min(a, b) : null;
          const hi = a !== null && b !== null ? Math.max(a, b) : null;
          const change = a !== null && b !== null ? b - a : null;
          return (
            <div key={r.key} className="contents">
              <span className="py-2 text-foreground">{r.label}</span>
              <div className="relative h-6" role="img" aria-label={`${r.label}: ${b !== null ? cefrLabel(b) : "not assessed"}${a !== null ? `, previously ${cefrLabel(a)}` : ""}`}>
                {LEVELS.map((l, i) => (
                  <span key={l} aria-hidden className="absolute top-1 h-4 w-px bg-slate-200" style={{ left: pos(i + 1) }} />
                ))}
                <span aria-hidden className="absolute left-0 right-0 top-3 h-px bg-slate-200" />
                {lo !== null && hi !== null && hi > lo && (
                  <span aria-hidden className="absolute top-[11px] h-0.5 rounded" style={{ left: pos(lo), width: `${((hi - lo) / 5) * 100}%`, background: PREV }} />
                )}
                {a !== null && (
                  <span
                    title={`Previous: ${cefrLabel(a)}`}
                    className="absolute top-1 h-4 w-4 -translate-x-1/2 rounded-full ring-2 ring-white"
                    style={{ left: pos(a), background: PREV }}
                  />
                )}
                {b !== null && (
                  <span
                    title={`This report: ${cefrLabel(b)}`}
                    className="absolute top-1 h-4 w-4 -translate-x-1/2 rounded-full ring-2 ring-white"
                    style={{ left: pos(b), background: NOW }}
                  />
                )}
              </div>
              <span className="text-right tabular-nums">
                <strong className="font-semibold">{b !== null ? cefrLabel(b) : "—"}</strong>
                {change !== null && change !== 0 && (
                  <span className={`block text-xs ${change > 0 ? "text-green-700" : "text-amber-700"}`}>
                    {change > 0 ? "▲" : "▼"} from {cefrLabel(a)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
