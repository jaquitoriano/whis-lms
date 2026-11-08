"use client";

import { useEffect, useId, useRef, useState } from "react";

// One series over time: IELTS bands (0–9) or CEFR levels (A1–C2). Thin 2px line, ringed markers,
// recessive hairline grid, the latest value labelled at the end, and an optional target line.
// Hover or keyboard (arrow keys) moves a crosshair that snaps to the nearest test; the same
// values are always in the results table below the chart, so the tooltip never hides anything.

export type TrendPoint = { date: string; value: number; note?: string };

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"];
function fmt(scale: "band" | "cefr", v: number) {
  if (scale === "band") return v.toFixed(1);
  const base = CEFR[Math.floor(v) - 1] ?? "";
  return v % 1 ? `${base}+` : base;
}
function fmtDate(d: string, withYear = false) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: withYear ? "numeric" : undefined, timeZone: "UTC" });
}

const INK = { primary: "#0f172a", secondary: "#475569", muted: "#64748b", grid: "#e8eaee", axis: "#cbd5e1", surface: "#ffffff" };
const LINE = "var(--brand-600)";

export function TrendChart({
  points,
  scale,
  target,
  label,
  height = 220,
  compact = false,
}: {
  points: TrendPoint[];
  scale: "band" | "cefr";
  target?: number | null;
  label: string;
  height?: number;
  compact?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length === 0) return null;

  // Y domain: the data (and target) with half a step of air, on the scale's own limits.
  const values = points.map((p) => p.value).concat(target != null ? [target] : []);
  const [lo, hi] = scale === "band" ? [0, 9] : [1, 6];
  let yMin = Math.max(lo, Math.floor(Math.min(...values) - 0.5));
  let yMax = Math.min(hi, Math.ceil(Math.max(...values) + 0.5));
  if (yMax - yMin < 2) {
    yMin = Math.max(lo, yMax - 2);
    yMax = Math.min(hi, yMin + 2);
  }
  const step = yMax - yMin <= 3 ? 0.5 : 1;
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += step) ticks.push(Math.round(v * 2) / 2);

  const m = { top: compact ? 10 : 14, right: compact ? 40 : 64, bottom: compact ? 22 : 28, left: compact ? 30 : 36 };
  const plotW = width - m.left - m.right;
  const plotH = height - m.top - m.bottom;
  const t = points.map((p) => Date.parse(`${p.date}T00:00:00Z`));
  const [t0, t1] = [Math.min(...t), Math.max(...t)];
  const x = (i: number) => (t1 === t0 ? m.left + plotW / 2 : m.left + ((t[i] - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => m.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const last = points.length - 1;
  // X labels: the last test always, then earlier ones only where they don't collide (tests can be
  // days apart, so even spacing by count isn't enough).
  const xLabels: number[] = [];
  for (let i = last; i >= 0; i--) if (xLabels.length === 0 || x(xLabels[xLabels.length - 1]) - x(i) >= 64) xLabels.push(i);

  function nearest(clientX: number) {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return null;
    const px = clientX - box.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    return best;
  }

  const a = active !== null ? points[active] : null;
  const tipLeft = active !== null ? Math.min(Math.max(x(active), 70), width - 70) : 0;
  // Above the point, or below it when the point is near the top.
  const tipTop = a ? (y(a.value) - 60 >= 0 ? y(a.value) - 60 : y(a.value) + 14) : 0;

  return (
    // The SVG is absolutely positioned so it never sets the width of its card: the card sets the
    // width, the observer reads it, and the chart redraws to fit (no sideways scrolling on phones).
    <div ref={wrap} className="relative w-full min-w-0 select-none overflow-hidden" style={{ height }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-labelledby={titleId}
        className="absolute inset-0 block"
        tabIndex={0}
        onPointerMove={(e) => setActive(nearest(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((v) => v ?? last)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setActive((v) => Math.max(0, (v ?? last) - 1));
          else if (e.key === "ArrowRight") setActive((v) => Math.min(last, (v ?? 0) + 1));
          else return;
          e.preventDefault();
        }}
      >
        {/* One string child: React treats <title> specially and needs plain text. */}
        <title id={titleId}>{`${label}: ${points.map((p) => `${fmtDate(p.date, true)} ${fmt(scale, p.value)}`).join(", ")}${target != null ? `. Target ${fmt(scale, target)}` : ""}`}</title>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.left} x2={m.left + plotW} y1={y(v)} y2={y(v)} stroke={v === yMin ? INK.axis : INK.grid} strokeWidth={1} shapeRendering="crispEdges" />
            {(step === 1 || v % 1 === 0 || !compact) && (
              <text x={m.left - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill={INK.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmt(scale, v)}
              </text>
            )}
          </g>
        ))}
        {xLabels.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={height - m.bottom + 16}
            textAnchor={points.length === 1 ? "middle" : i === 0 ? "start" : i === last ? "end" : "middle"}
            fontSize={11}
            fill={INK.muted}
          >
            {fmtDate(points[i].date)}
          </text>
        ))}

        {target != null && target >= yMin && target <= yMax && (
          <g>
            <line x1={m.left} x2={m.left + plotW} y1={y(target)} y2={y(target)} stroke={INK.secondary} strokeWidth={1} shapeRendering="crispEdges" />
            <text x={m.left + plotW + 6} y={y(target)} dy="0.32em" fontSize={11} fill={INK.secondary}>
              {`Target ${fmt(scale, target)}`}
            </text>
          </g>
        )}

        {active !== null && <line x1={x(active)} x2={x(active)} y1={m.top} y2={m.top + plotH} stroke={INK.axis} strokeWidth={1} />}
        <path d={path} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={active === i ? 5.5 : 4} fill={LINE} stroke={INK.surface} strokeWidth={2} />
        ))}
        {(target == null || Math.abs(y(points[last].value) - y(target)) > 12) && (
          <text x={x(last) + 9} y={y(points[last].value)} dy="0.32em" fontSize={compact ? 12 : 13} fontWeight={600} fill={INK.primary}>
            {fmt(scale, points[last].value)}
          </text>
        )}
      </svg>
      {a && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm"
          style={{ left: tipLeft, top: tipTop }}
        >
          <span className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: LINE }} />
            <strong className="text-sm text-foreground">{fmt(scale, a.value)}</strong>
          </span>
          <span className="mt-0.5 block text-muted">
            {fmtDate(a.date, true)}
            {a.note ? ` · ${a.note}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
