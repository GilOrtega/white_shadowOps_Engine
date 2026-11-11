"use client";

import { useState } from "react";
import { diffDays, parseDate, type WeightPoint } from "@/hq/logic";

/** Colores validados (luminosidad y daltonismo) para el tema claro y el oscuro; viven en globals.css. */
const TREND = "var(--chart-trend)";
const DAILY = "var(--chart-daily)";
const W = 380, H = 230, PAD = { l: 30, r: 66, t: 14, b: 26 };

const fmtDay = (d: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(parseDate(d));

export function WeightChart({ series, goalKg }: { series: WeightPoint[]; goalKg: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const first = series[0];
  const last = series.at(-1);
  if (!first || !last || series.length < 2) {
    return <p className="rounded-xl border border-dashed border-edge p-6 text-center text-sm text-mute">Registra tu primer pesaje y aquí aparece tu tendencia.</p>;
  }
  const span = Math.max(1, diffDays(first.date, last.date));
  const values = series.flatMap((p) => [p.kg, p.trend]).concat(goalKg !== null ? [goalKg] : []);
  const lo = Math.floor(Math.min(...values) - 0.5);
  const hi = Math.ceil(Math.max(...values) + 0.5);
  const x = (d: string) => PAD.l + (diffDays(first.date, d) / span) * (W - PAD.l - PAD.r);
  const y = (kg: number) => PAD.t + ((hi - kg) / (hi - lo)) * (H - PAD.t - PAD.b);
  const step = hi - lo <= 4 ? 1 : hi - lo <= 10 ? 2 : 5;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const path = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p.trend).toFixed(1)}`).join(" ");
  const h = hover !== null ? series[hover] : undefined;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    series.forEach((p, i) => {
      if (Math.abs(x(p.date) - px) < Math.abs(x(series[best]!.date) - px)) best = i;
    });
    setHover(best);
  }

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute">
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-0.5 w-4 rounded" style={{ background: TREND }} />Tendencia (promedio de 7 días)</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: DAILY }} />Pesaje del día</span>
        {goalKg !== null && <span className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block w-4 border-t border-dashed border-mute" />Meta</span>}
      </figcaption>
      <div className="relative max-w-2xl">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Peso del ${fmtDay(first.date)} al ${fmtDay(last.date)}: tendencia de ${first.trend.toFixed(1)} a ${last.trend.toFixed(1)} kg. La tabla de abajo tiene los datos.`}
          className="w-full max-w-2xl touch-none select-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth="1" />
              <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize="12" className="fill-mute">{t}</text>
            </g>
          ))}
          <text x={PAD.l} y={H - 8} fontSize="12" className="fill-mute">{fmtDay(first.date)}</text>
          <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize="12" className="fill-mute">{fmtDay(last.date)}</text>
          {goalKg !== null && (
            <>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(goalKg)} y2={y(goalKg)} className="stroke-mute" strokeWidth="1" strokeDasharray="4 4" />
              <text x={W - PAD.r + 6} y={y(goalKg) + 4} fontSize="12" className="fill-mute">meta {goalKg.toFixed(1)}</text>
            </>
          )}
          {h && <line x1={x(h.date)} x2={x(h.date)} y1={PAD.t} y2={H - PAD.b} className="stroke-edge" strokeWidth="1" />}
          <path d={path} fill="none" style={{ stroke: TREND }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {series.map((p, i) => (
            <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r={hover === i ? 5.5 : 4} style={{ fill: DAILY }} className="stroke-panel" strokeWidth="2" />
          ))}
          <circle cx={x(last.date)} cy={y(last.trend)} r="4" style={{ fill: TREND }} className="stroke-panel" strokeWidth="2" />
          {(goalKg === null || Math.abs(y(goalKg) - y(last.trend)) > 14) && (
            <text x={x(last.date) + 8} y={y(last.trend) + 4} fontSize="13" fontWeight="600" className="fill-fg">{last.trend.toFixed(1)} kg</text>
          )}
        </svg>
        {h && (
          <div role="status" className="pointer-events-none absolute top-2 rounded-xl bg-well px-3 py-2 text-xs shadow-lg"
            style={x(h.date) > W / 2 ? { right: `${100 - (x(h.date) / W) * 100 + 2}%` } : { left: `${(x(h.date) / W) * 100 + 2}%` }}>
            <p className="mb-1 text-mute">{fmtDay(h.date)}</p>
            <p className="flex items-center gap-2"><span aria-hidden="true" className="inline-block h-0.5 w-3 rounded" style={{ background: TREND }} /><b className="text-sm">{h.trend.toFixed(1)} kg</b><span className="text-mute">tendencia</span></p>
            <p className="flex items-center gap-2"><span aria-hidden="true" className="inline-block h-0.5 w-3 rounded" style={{ background: DAILY }} /><b className="text-sm">{h.kg.toFixed(1)} kg</b><span className="text-mute">pesaje</span></p>
          </div>
        )}
      </div>
    </figure>
  );
}
