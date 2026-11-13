import type { ComponentProps, ReactNode } from "react";
import type { AgentStatus } from "@/hq/logic";

/** Tarjeta plana sobre el fondo, como las listas agrupadas del sistema. */
export function Card({ className = "", ...p }: ComponentProps<"section">) {
  return <section {...p} className={`glass rounded-[22px] p-5 ${className}`} />;
}

export function H2({ children, id }: { children: ReactNode; id?: string }) {
  return <h2 id={id} className="font-display text-[19px] font-semibold tracking-[-0.015em]">{children}</h2>;
}

/** Título grande de pantalla. */
export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        {sub && <p className="text-[13px] font-medium text-mute">{sub}</p>}
        <h1 className="font-display text-[38px] font-bold leading-[1.05] tracking-[-0.03em] md:text-[44px]">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function Bar({ pct, tone = "accent", label }: { pct: number; tone?: "accent" | "lime" | "sky" | "amber" | "iris"; label: string }) {
  const color = tone === "sky" ? "bg-sky" : tone === "amber" ? "bg-amber" : tone === "iris" ? "bg-iris" : "bg-accent";
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
      <div className={`h-full rounded-full ${color} shadow-[0_0_12px_currentColor] transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]`} style={{ width: `${v}%` }} />
    </div>
  );
}

const PILL: Record<AgentStatus, string> = {
  working: "bg-iris/15 text-iris ring-1 ring-inset ring-iris/25",
  needs: "bg-amber/12 text-amber ring-1 ring-inset ring-amber/25",
  done: "bg-accent/12 text-accent ring-1 ring-inset ring-accent/25",
  idle: "bg-white/[0.05] text-mute ring-1 ring-inset ring-white/10",
};
export function Pill({ status, children }: { status: AgentStatus; children: ReactNode }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${PILL[status]}`}>{children}</span>;
}

export function Avatar({ name, strong = false }: { name: string; strong?: boolean }) {
  return (
    <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-[17px] font-bold ${strong ? "bg-lime text-ink" : "bg-gradient-to-b from-iris/30 to-iris/10 text-fg ring-1 ring-inset ring-iris/30"}`}>
      {name.charAt(0)}
    </span>
  );
}

export const btn = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-lime px-4.5 text-[15px] font-semibold text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_6px_20px_-6px_rgb(198_244_50/0.55)] hover:brightness-105 disabled:opacity-40 disabled:shadow-none",
  ghost:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4.5 text-[15px] font-semibold text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] hover:border-white/20 hover:bg-white/[0.1] disabled:opacity-40",
  ai: "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-iris/30 bg-iris/15 px-4.5 text-[15px] font-semibold text-[#d6cfff] hover:bg-iris/25 disabled:opacity-40",
  chip: "inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-4 text-[14px] font-medium text-fg hover:border-white/20 hover:bg-white/[0.09]",
};
export const input =
  "min-h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3.5 text-[16px] text-fg shadow-[inset_0_1px_2px_rgb(0_0_0/0.3)] placeholder:text-mute/60 focus:border-iris/60 focus:outline-none focus:ring-4 focus:ring-iris/15";

/** Lista agrupada: filas separadas por una línea fina dentro de un mismo contenedor. */
export const group = "overflow-hidden rounded-2xl border border-white/[0.06] bg-black/20 divide-y divide-line";
export const row = "flex min-h-[3.75rem] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03]";

export function Check({ done }: { done: boolean }) {
  return (
    <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${done ? "border-lime bg-lime shadow-[0_0_14px_rgb(198_244_50/0.5)]" : "border-white/20"}`}>
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
      <div className="h-10 w-1/2 animate-pulse rounded-xl bg-white/[0.05]" />
      <div className="h-56 animate-pulse rounded-[22px] bg-white/[0.04]" />
      <div className="h-40 animate-pulse rounded-[22px] bg-white/[0.04]" />
    </div>
  );
}

const paths: Record<string, ReactNode> = {
  home: <><path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9.500h12V10" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  chart: <path d="M5 20V11M12 20V4M19 20v-6" />,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  menu: <path d="M5 7h14M5 12h14M5 17h14" />,
  video: <><rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M10.5 9.500l4 2.5-4 2.500z" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.900l2.1 2.100M17 17l2.1 2.100M4.9 19.100L7 17M17 7l2.1-2.1" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  shield: <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-9 9" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  sparkle: <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z" />,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></>,
  compare: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M12 4v16" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  left: <path d="M15 6l-6 6 6 6" />,
  scale: <><rect x="3" y="4" width="18" height="16" rx="4" /><path d="M8.5 10a5 5 0 0 1 7 0l-2.5 2.5" /></>,
  fork: <><path d="M7 3v8a3 3 0 0 0 6 0V3M10 3v18" /><path d="M17 3c-1.5 1.5-2 3.5-2 6s1 3 2 3v9" /></>,
  sparkles: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2.5" /><path d="M9.5 9.5h5v5h-5zM9 2.5V6M15 2.5V6M9 18v3.500M15 18v3.500M2.5 9H6M2.5 15H6M18 9h3.500M18 15h3.500" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  play: <path d="M8 5.5v13l10.500-6.500z" />,
  copy: <><rect x="8.500" y="8.500" width="11" height="11" rx="2.500" /><path d="M15.500 8.500V6a1.500 1.500 0 0 0-1.500-1.500H6A1.500 1.500 0 0 0 4.500 6v8A1.500 1.500 0 0 0 6 15.500h2.500" /></>,
  download: <><path d="M12 4v11M7.500 10.500 12 15l4.500-4.500" /><path d="M5 19.500h14" /></>,
  rocket: <><path d="M12 15l-3-3c1.500-5 4.500-8.500 10-9 -.5 5.500-4 8.500-9 10z" /><path d="M9 12l-3.500.5L4 15l3.500.5M12 15l-.5 3.500L9 20l-.5-3.500" /><circle cx="15" cy="9" r="1.300" /></>,
};
export function Icon({ name, size = 20, strokeWidth = 2 }: { name: keyof typeof paths | string; size?: number; strokeWidth?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}
