"use client";

import Link from "next/link";
import { useState } from "react";
import * as F from "@/hq/facets";
import { kindLabel, sortCaptures, type Capture } from "@/hq/journal";
import { useImageUrl } from "@/hq/journal-store";
import { parseDate } from "@/hq/logic";

/*
 * Visuales del centro de mando. Todo es SVG propio (sin librerías): ilustraciones por faceta,
 * mini gráficas de 7 días, mapa de constancia y tendencia de la calificación.
 * Identidad por color de faceta + nombre siempre visible (nunca solo color).
 */
export const HEX: Record<F.FacetId, string> = { cuerpo: "#c6f432", mente: "#8e7cff", trabajo: "#7cc4ff", marca: "#ffb45c", dinero: "#5ee6b8" };
const NAME: Record<F.FacetId, string> = { cuerpo: "Cuerpo", mente: "Mente", trabajo: "Trabajo", marca: "Marca", dinero: "Dinero" };
const IDS: F.FacetId[] = ["cuerpo", "mente", "trabajo", "marca", "dinero"];
const dayShort = (d: string) => new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric" }).format(parseDate(d));
const dayLetter = (d: string) => new Intl.DateTimeFormat("es-MX", { weekday: "narrow" }).format(parseDate(d)).toUpperCase();

// --- ilustraciones (decorativas, originales) --------------------------------------------
export function FacetArt({ id, className = "" }: { id: F.FacetId; className?: string }) {
  const c = HEX[id];
  const g = `art-${id}`;
  return (
    <svg aria-hidden="true" viewBox="0 0 120 120" className={className} fill="none">
      <defs>
        <radialGradient id={g} cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor={c} stopOpacity="0.35" /><stop offset="1" stopColor={c} stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill={`url(#${g})`} />
      <g stroke={c} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        {id === "cuerpo" && (<>
          <rect x="22" y="50" width="10" height="24" rx="3" fill={c} fillOpacity="0.25" /><rect x="88" y="50" width="10" height="24" rx="3" fill={c} fillOpacity="0.25" />
          <rect x="14" y="55" width="8" height="14" rx="2.5" /><rect x="98" y="55" width="8" height="14" rx="2.5" /><path d="M32 62h56" />
          <path d="M60 22c6 7 10 12 10 18a10 10 0 0 1-20 0c0-4 2-7 4-9 0 4 2 6 4 6 0-6-1-10 2-15z" fill={c} fillOpacity="0.3" />
        </>)}
        {id === "mente" && (<>
          <path d="M70 26a30 30 0 1 0 24 46A26 26 0 0 1 70 26z" fill={c} fillOpacity="0.22" />
          <path d="M30 30l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5zM92 84l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z" fill={c} fillOpacity="0.5" />
          <circle cx="88" cy="34" r="2.5" fill={c} />
        </>)}
        {id === "trabajo" && (<>
          <rect x="24" y="30" width="72" height="48" rx="6" fill={c} fillOpacity="0.14" /><path d="M14 88h92l-6 8H20z" fill={c} fillOpacity="0.25" />
          <path d="M48 46l-8 8 8 8M72 46l8 8-8 8M64 42l-8 24" />
        </>)}
        {id === "marca" && (<>
          <rect x="40" y="16" width="40" height="80" rx="9" fill={c} fillOpacity="0.14" /><path d="M54 46v20l17-10z" fill={c} fillOpacity="0.6" />
          <path d="M88 38a22 22 0 0 1 0 36M96 30a34 34 0 0 1 0 52M32 38a22 22 0 0 0 0 36M24 30a34 34 0 0 0 0 52" opacity="0.7" />
        </>)}
        {id === "dinero" && (<>
          <ellipse cx="44" cy="84" rx="20" ry="7" fill={c} fillOpacity="0.2" /><path d="M24 84v-10c0 4 9 7 20 7s20-3 20-7v10" /><ellipse cx="44" cy="74" rx="20" ry="7" fill={c} fillOpacity="0.3" />
          <path d="M24 74V64c0 4 9 7 20 7s20-3 20-7v10" /><ellipse cx="44" cy="64" rx="20" ry="7" fill={c} fillOpacity="0.4" />
          <path d="M72 70l12-14 9 8 15-20M98 44h10v10" />
        </>)}
      </g>
    </svg>
  );
}

// --- mini gráficas de 7 días ---------------------------------------------------------------
/** Barras de 0–100 por día (hoy al final, resaltado). */
export function MiniBars({ id, points, label }: { id: F.FacetId; points: { date: string; v: number | null }[]; label: string }) {
  const w = 280, h = 36, gap = 6;
  const bw = (w - gap * (points.length - 1)) / points.length;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h + 14}`} className="h-auto w-full">
      {points.map((p, i) => {
        const v = p.v ?? 0;
        const bh = Math.max(v > 0 ? 3 : 0, (v / 100) * h);
        const last = i === points.length - 1;
        return (
          <g key={p.date}>
            <title>{`${dayShort(p.date)}: ${p.v === null ? "sin datos" : `${Math.round(v)}%`}`}</title>
            <rect x={i * (bw + gap) - 1} y={0} width={bw + 2} height={h + 10} fill="transparent" />
            <rect x={i * (bw + gap)} y={0} width={bw} height={h} rx={4} fill="rgb(255 255 255 / 0.05)" />
            {bh > 0 && <rect x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx={4} fill={HEX[id]} opacity={last ? 1 : 0.55} />}
            <text x={i * (bw + gap) + bw / 2} y={h + 12} textAnchor="middle" fontSize="10" fill={last ? "rgb(255 255 255 / 0.85)" : "rgb(255 255 255 / 0.4)"}>{dayLetter(p.date)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Dinero: acumulado del mes contra la línea de ritmo (punteada). */
export function PaceLine({ data, label }: { data: { date: string; acc: number; pace: number }[]; label: string }) {
  const w = 280, h = 44;
  const max = Math.max(1, ...data.map((d) => Math.max(d.acc, d.pace)));
  const x = (i: number) => (data.length <= 1 ? w : (i / (data.length - 1)) * w);
  const y = (v: number) => h - (v / max) * (h - 4) - 2;
  const path = (k: "acc" | "pace") => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(" ");
  const last = data.at(-1);
  const fmt = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`;
  return (
    <div className="flex flex-col gap-1">
    <svg role="img" aria-label={`${label}: ${fmt(last?.acc ?? 0)} contra ${fmt(last?.pace ?? 0)} esperado`} viewBox={`0 0 ${w} ${h + 6}`} preserveAspectRatio="none" className="h-14 w-full overflow-visible">
      <path d={`${path("acc")} L${w},${h} L0,${h} Z`} fill={HEX.dinero} opacity="0.12" />
      <path d={path("pace")} stroke="rgb(255 255 255 / 0.45)" strokeWidth="1.5" strokeDasharray="3 3" fill="none" vectorEffect="non-scaling-stroke" />
      <path d={path("acc")} stroke={HEX.dinero} strokeWidth="2" fill="none" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
    <p className="flex gap-3 text-[11px] text-mute">
      <span className="flex items-center gap-1"><span className="h-0.5 w-3 rounded" style={{ background: HEX.dinero }} />Acumulado {fmt(last?.acc ?? 0)}</span>
      <span className="flex items-center gap-1"><span className="h-0 w-3 border-t border-dashed border-white/50" />Ritmo {fmt(last?.pace ?? 0)}</span>
    </p>
    </div>
  );
}

// --- tendencia de la calificación (con cursor y tooltip) ------------------------------------
export function ScoreTrend({ days }: { days: F.DayScores[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 560, h = 150, pad = { l: 28, r: 10, t: 12, b: 22 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const x = (i: number) => pad.l + (days.length <= 1 ? iw : (i / (days.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / 100) * ih;
  const pts = days.map((d, i) => (d.life === null ? null : { i, v: d.life }));
  const line = pts.filter(Boolean).map((p, k) => `${k ? "L" : "M"}${x(p!.i).toFixed(1)},${y(p!.v).toFixed(1)}`).join(" ");
  const first = pts.find(Boolean), last = [...pts].reverse().find(Boolean);
  const area = first && last ? `${line} L${x(last.i)},${y(0)} L${x(first.i)},${y(0)} Z` : "";
  const h1 = hover !== null ? days[hover] : null;
  return (
    <div className="relative">
      <svg role="img" aria-label="Calificación diaria de las últimas dos semanas" viewBox={`0 0 ${w} ${h}`} className="h-auto w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * w;
          setHover(Math.max(0, Math.min(days.length - 1, Math.round(((px - pad.l) / iw) * (days.length - 1)))));
        }}>
        <defs><linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#c6f432" stopOpacity="0.28" /><stop offset="1" stopColor="#c6f432" stopOpacity="0" /></linearGradient></defs>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="rgb(255 255 255 / 0.06)" />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="rgb(255 255 255 / 0.4)">{v}</text>
          </g>
        ))}
        {days.map((d, i) => (i % 2 === (days.length - 1) % 2 ? <text key={d.date} x={x(i)} y={h - 6} textAnchor="middle" fontSize="9" fill={i === days.length - 1 ? "rgb(255 255 255 / 0.85)" : "rgb(255 255 255 / 0.4)"}>{Number(d.date.slice(8))}</text> : null))}
        {area && <path d={area} fill="url(#trend-fill)" />}
        {line && <path d={line} stroke="#c6f432" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="rgb(255 255 255 / 0.25)" />}
        {pts.map((p) => p && (p.i === days.length - 1 || p.i === hover) && <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r="4.5" fill="#c6f432" stroke="#161922" strokeWidth="2" />)}
      </svg>
      {h1 && (
        <div className="pointer-events-none absolute top-0 rounded-xl border border-white/10 bg-[#11141b]/95 px-3 py-2 text-[12px] shadow-xl"
          style={{ left: `${Math.min(70, Math.max(0, (x(hover!) / w) * 100 - 12))}%` }}>
          <p className="font-semibold">{dayShort(h1.date)} · {h1.life ?? "—"} pts</p>
          {IDS.map((id) => <p key={id} className="flex items-center gap-1.5 text-mute"><span className="h-2 w-2 rounded-full" style={{ background: HEX[id] }} />{NAME[id]}: <span className="tnum text-fg">{h1.scores[id] === null ? "—" : Math.round(h1.scores[id]!)}</span></p>)}
        </div>
      )}
    </div>
  );
}

// --- mapa de constancia (facetas × días) ------------------------------------------------------
export function ConsistencyMap({ days }: { days: F.DayScores[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 3 }}>
        <caption className="sr-only">Constancia por faceta en los últimos {days.length} días (0 a 100)</caption>
        <thead>
          <tr>
            <th scope="col" className="sr-only">Faceta</th>
            {days.map((d, i) => <th key={d.date} scope="col" className={`text-center text-[10px] font-medium ${i === days.length - 1 ? "text-fg" : "text-mute"}`}>{dayLetter(d.date)}</th>)}
          </tr>
        </thead>
        <tbody>
          {IDS.map((id) => (
            <tr key={id}>
              <th scope="row" className="pr-2 text-left text-[12px] font-medium whitespace-nowrap"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: HEX[id] }} />{NAME[id]}</th>
              {days.map((d) => {
                const v = d.scores[id];
                return (
                  <td key={d.date} title={`${NAME[id]} · ${dayShort(d.date)}: ${v === null ? "sin datos" : `${Math.round(v)}%`}`}
                    className="h-5 min-w-4 rounded-[5px]"
                    style={{ background: v === null ? "transparent" : v === 0 ? "rgb(255 255 255 / 0.05)" : HEX[id], opacity: v === null || v === 0 ? 1 : 0.25 + (v / 100) * 0.75, outline: v === null ? "1px dashed rgb(255 255 255 / 0.08)" : undefined }}>
                    <span className="sr-only">{v === null ? "sin datos" : `${Math.round(v)}%`}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 flex items-center gap-2 text-[11px] text-mute">
        Menos <span className="inline-flex gap-0.5">{[0.25, 0.5, 0.75, 1].map((o) => <span key={o} className="h-2.5 w-2.5 rounded-[3px] bg-white" style={{ opacity: o }} />)}</span> Más · punteado = sin datos
      </p>
    </div>
  );
}

// --- fotos de la Bitácora ------------------------------------------------------------------------
function Thumb({ c }: { c: Capture }) {
  const url = useImageUrl(c.id, "thumb");
  return (
    <Link href="/bitacora" className="group relative block aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-2xl bg-white/[0.05] ring-1 ring-white/10 sm:w-32">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura local (IndexedDB)
        <img src={url} alt={c.note || kindLabel(c.kind)} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
      ) : <span className="absolute inset-0 animate-pulse bg-white/[0.04]" />}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 text-[11px] font-medium text-white">
        {kindLabel(c.kind)} · {c.date.slice(8)}/{c.date.slice(5, 7)}
      </span>
    </Link>
  );
}

export function PhotoStrip({ captures }: { captures: Capture[] }) {
  const list = sortCaptures(captures).slice(0, 10);
  if (!list.length) {
    return (
      <Link href="/bitacora" className="flex items-center gap-4 rounded-2xl border border-dashed border-white/15 p-4 hover:bg-white/[0.03]">
        <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded-xl bg-iris/15 text-2xl">📸</span>
        <span className="text-[14px] text-mute"><b className="text-fg">Tu historia en fotos.</b> Sube capturas de tu físico, tus métricas de TikTok o tu tablero y aquí se arma tu línea del tiempo.</span>
      </Link>
    );
  }
  return <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">{list.map((c) => <Thumb key={c.id} c={c} />)}</div>;
}

/** Antes vs. ahora con las fotos de "físico" de la Bitácora. */
export function BeforeNow({ captures }: { captures: Capture[] }) {
  const fis = sortCaptures(captures.filter((c) => c.kind === "fisico"));
  const now = fis[0] ?? null;
  const before = fis.at(-1) ?? null;
  const a = useImageUrl(before && before !== now ? before.id : null, "full");
  const b = useImageUrl(now?.id ?? null, "full");
  if (!now || !before || before === now) return null;
  return (
    <figure className="grid grid-cols-2 gap-2">
      {[{ url: a, c: before, t: "Antes" }, { url: b, c: now, t: "Ahora" }].map(({ url, c, t }) => (
        <div key={t} className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-white/[0.05]">
          {/* eslint-disable-next-line @next/next/no-img-element -- foto local */}
          {url && <img src={url} alt={`${t}: ${c.date}`} className="h-full w-full object-cover" />}
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-semibold text-white backdrop-blur">{t} · {c.date.slice(8)}/{c.date.slice(5, 7)}</span>
        </div>
      ))}
      <figcaption className="col-span-2 text-[12px] text-mute">Tus fotos de “físico” de la Bitácora: la primera contra la más reciente.</figcaption>
    </figure>
  );
}
