// A single-series column chart in plain HTML, so labels stay readable at any width. Columns are at
// most 24px wide, rounded only at the data end, grow from one baseline, and carry their value on
// the cap. Each column also has a hover/focus title; every value is in the table below too.
export function ColumnChart({
  data,
  label,
  format = (v) => v.toLocaleString("en-US"),
  height = 160,
}: {
  data: { key: string; label: string; value: number; detail?: string }[];
  label: string;
  format?: (v: number) => string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure aria-label={label}>
      <div className="flex items-end gap-1 border-b border-slate-300" style={{ height: height + 22 }}>
        {data.map((d) => (
          <div
            key={d.key}
            tabIndex={0}
            title={`${d.label}: ${format(d.value)}${d.detail ? ` · ${d.detail}` : ""}`}
            className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded focus:bg-slate-50 focus:outline-none"
          >
            <span className="mb-1 whitespace-nowrap text-[11px] font-medium tabular-nums text-foreground">{d.value ? format(d.value) : ""}</span>
            <span
              aria-hidden
              className="w-full max-w-6 rounded-t bg-brand-600 transition-opacity group-hover:opacity-80"
              style={{ height: d.value ? Math.max(2, (d.value / max) * height) : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1" aria-hidden>
        {data.map((d) => (
          <span key={d.key} className="min-w-0 flex-1 truncate text-center text-[11px] text-muted">
            {d.label}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        {label}: {data.map((d) => `${d.label} ${format(d.value)}`).join(", ")}
      </figcaption>
    </figure>
  );
}
