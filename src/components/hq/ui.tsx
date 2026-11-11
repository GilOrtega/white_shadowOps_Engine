import type { ComponentProps, ReactNode } from "react";
import type { AgentStatus } from "@/hq/logic";

/** Tarjeta plana sobre el fondo, como las listas agrupadas del sistema. */
export function Card({ className = "", ...p }: ComponentProps<"section">) {
  return <section {...p} className={`rounded-3xl bg-panel p-5 ${className}`} />;
}

export function H2({ children, id }: { children: ReactNode; id?: string }) {
  return <h2 id={id} className="text-[20px] font-semibold tracking-tight">{children}</h2>;
}

/** Título grande de pantalla. */
export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        {sub && <p className="text-[13px] font-medium text-mute">{sub}</p>}
        <h1 className="text-[34px] font-bold leading-tight tracking-tight">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function Bar({ pct, tone = "accent", label }: { pct: number; tone?: "accent" | "lime" | "sky" | "amber"; label: string }) {
  const color = tone === "sky" ? "bg-sky" : tone === "amber" ? "bg-amber" : "bg-accent";
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} className="h-1.5 overflow-hidden rounded-full bg-edge/60">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
    </div>
  );
}

const PILL: Record<AgentStatus, string> = {
  working: "bg-accent/15 text-accent",
  needs: "bg-amber/15 text-amber",
  done: "bg-sky/15 text-sky",
  idle: "bg-edge/40 text-mute",
};
export function Pill({ status, children }: { status: AgentStatus; children: ReactNode }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${PILL[status]}`}>{children}</span>;
}

export function Avatar({ name, strong = false }: { name: string; strong?: boolean }) {
  return (
    <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-[17px] font-bold ${strong ? "bg-lime text-ink" : "bg-well text-fg"}`}>
      {name.charAt(0)}
    </span>
  );
}

export const btn = {
  primary: "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-lime px-5 text-[15px] font-semibold text-ink disabled:opacity-40",
  ghost: "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent/12 px-5 text-[15px] font-semibold text-accent disabled:opacity-40",
  chip: "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-well px-4 text-[15px] font-medium text-fg",
};
export const input = "min-h-12 w-full rounded-xl bg-well px-3.5 text-[16px] text-fg placeholder:text-mute/70";

/** Lista agrupada: filas separadas por una línea fina dentro de un mismo contenedor. */
export const group = "overflow-hidden rounded-2xl bg-well divide-y divide-line";
export const row = "flex min-h-[3.75rem] w-full items-center gap-3 px-4 py-2.5 text-left";

export function Check({ done }: { done: boolean }) {
  return (
    <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${done ? "border-lime bg-lime" : "border-edge"}`}>
      {done && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
    </span>
  );
}

export function Loading() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="grid gap-4">
      <div className="h-10 w-1/2 animate-pulse rounded-xl bg-panel" />
      <div className="h-56 animate-pulse rounded-3xl bg-panel" />
      <div className="h-40 animate-pulse rounded-3xl bg-panel" />
    </div>
  );
}

const paths: Record<string, ReactNode> = {
  home: <><path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9.500h12V10" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  chart: <path d="M5 20V11M12 20V4M19 20v-6" />,
  video: <><rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M10.5 9.500l4 2.5-4 2.500z" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.900l2.1 2.100M17 17l2.1 2.100M4.9 19.100L7 17M17 7l2.1-2.1" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  shield: <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M9 6l6 6-6 6" />,
};
export function Icon({ name, size = 20, strokeWidth = 2 }: { name: keyof typeof paths | string; size?: number; strokeWidth?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}
