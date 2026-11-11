"use client";

import Link from "next/link";
import { briefing } from "@/hq/coordinator";
import { pulse } from "@/hq/journal";
import { useCaptures } from "@/hq/journal-store";
import * as L from "@/hq/logic";
import type { HqState } from "@/hq/schemas";
import { Icon } from "./ui";

/** Insignia original: galones según el rango y puntos por prestigio. */
export function RankBadge({ tier, prestige, size = 56 }: { tier: number; prestige: number; size?: number }) {
  const chevrons = (tier % 5) + 1;
  const elite = tier >= 5;
  const dots = Math.min(prestige, 3);
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" role="img" aria-label={`Insignia de ${L.RANKS[tier]}${prestige ? `, prestigio ${prestige}` : ""}`}>
      <path d="M36 3l27 10v22c0 17-11.5 28-27 34C20.5 63 9 52 9 35V13z" fill={elite ? "#c6f432" : "#12141c"} stroke="#c6f432" strokeWidth="3" strokeLinejoin="round" />
      {Array.from({ length: chevrons }, (_, i) => {
        const y = 50 - i * 7 - (5 - chevrons) * 3.5;
        return <path key={i} d={`M22 ${y}l14-8 14 8`} fill="none" stroke={elite ? "#000" : "#c6f432"} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />;
      })}
      {Array.from({ length: dots }, (_, i) => (
        <circle key={i} cx={36 + (i - (dots - 1) / 2) * 9} cy={13} r="3" fill={elite ? "#000" : "#c6f432"} />
      ))}
    </svg>
  );
}

function Ring({ done, total, full }: { done: number; total: number; full: boolean }) {
  const R = 50, C = 2 * Math.PI * R;
  return (
    <div className="relative h-32 w-32 shrink-0 rounded-full">
      <span aria-hidden="true" className={`absolute inset-3 rounded-full blur-2xl ${full ? "bg-lime/40" : "bg-lime/10"}`} />
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="13" className="stroke-white/[0.07]" />
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="13" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - done / Math.max(total, 1))} className="wso-ring stroke-lime drop-shadow-[0_0_8px_rgb(198_244_50/0.6)]" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum font-display text-[34px] font-bold leading-none tracking-[-0.03em]">{done}/{total}</span>
        <span className="text-xs font-medium text-mute">misiones</span>
      </div>
    </div>
  );
}

const CONFETTI = [
  { l: "8%", c: "#c6f432", d: "0s" }, { l: "22%", c: "#fff", d: ".08s" }, { l: "37%", c: "#8e7cff", d: ".16s" }, { l: "51%", c: "#c6f432", d: ".04s" },
  { l: "64%", c: "#fff", d: ".2s" }, { l: "78%", c: "#8e7cff", d: ".12s" }, { l: "90%", c: "#c6f432", d: ".06s" },
];

export function Hero({ hq, today }: { hq: HqState; today: string }) {
  const required = L.missionsFor(hq, today).filter((m) => m.required);
  const done = required.filter((m) => m.done).length;
  const complete = done === required.length;
  const info = L.challengeInfo(hq.profile, today);
  const prog = L.progress(hq);
  const rank = L.rankInfo(prog.xp);
  const streak = L.streak(hq, today);
  const left = required.length - done;
  const captures = useCaptures();
  const next = briefing(hq, today, 12, captures ? pulse(captures, today) : null).next;

  return (
    <section aria-label="Tu día" className={`glass shattered overflow-hidden rounded-[28px] p-5 md:p-7 ${complete ? "ring-1 ring-lime/40" : ""}`}>
      <span aria-hidden="true" className={`pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full blur-3xl ${complete ? "bg-lime/25" : "bg-iris/20"}`} />
      {complete && CONFETTI.map((c, i) => (
        <span key={i} aria-hidden="true" className="wso-confetti absolute bottom-6 h-2.5 w-2.5 rounded-sm" style={{ left: c.l, background: c.c, animationDelay: c.d }} />
      ))}
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-8">
        <div className="flex items-center gap-5">
          <Ring done={done} total={required.length} full={complete} />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="tnum text-[13px] font-semibold text-lime">Día {info.dayNumber} de {hq.profile.challengeDays}</p>
            <p className="font-display text-[30px] font-bold leading-[1.05] tracking-[-0.03em] md:text-[34px]" role="status">
              {complete ? "Día cumplido." : left === required.length ? `A remontar, ${hq.profile.name}.` : `Te ${left === 1 ? "falta 1" : `faltan ${left}`}. No sueltes.`}
            </p>
            <p className="text-[15px] text-mute">
              {complete ? `+${L.XP.day} XP y racha de ${streak} ${streak === 1 ? "día" : "días"}` : info.finished ? "El reto terminó: toca el video final." : `Faltan ${info.daysLeft} días para el video final.`}
            </p>
          </div>
        </div>

        <div className="flex flex-1 items-center gap-3.5 rounded-[20px] border border-white/[0.07] bg-black/25 p-4 md:min-w-[290px]">
          <RankBadge tier={rank.tier} prestige={rank.prestige} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-display text-[20px] font-bold">{rank.name}{rank.prestige > 0 ? ` P${rank.prestige}` : ""}</span>
              <span className="shrink-0 text-xs text-mute">{prog.xp.toLocaleString("es-MX")} XP</span>
            </div>
            <div role="progressbar" aria-label="Avance al siguiente rango" aria-valuemin={0} aria-valuemax={L.XP.perLevel} aria-valuenow={rank.into} className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
              <div className="h-full rounded-full bg-gradient-to-r from-iris to-lime" style={{ width: `${(rank.into / L.XP.perLevel) * 100}%` }} />
            </div>
            <span className="text-xs text-mute">{rank.toNext} XP para {rank.nextName}</span>
          </div>
          <div className="flex shrink-0 flex-col items-center border-l border-line pl-3.5">
            <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth="2" strokeLinejoin="round" aria-hidden="true" className={`stroke-amber ${streak > 0 ? "fill-amber" : "fill-none"}`}><path d="M12 2c1 4 5 5.5 5 10.5A5 5 0 0 1 7 13c0-1.5.5-2.5 1.5-3.5C9 11 10 11.5 10.5 11 11 9 10.5 5 12 2z" /></svg>
            <span className="font-display text-2xl font-bold leading-none">{streak}</span>
            <span className="text-[11px] text-mute">racha</span>
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
        {hq.profile.stake && <p className="text-[15px] font-semibold text-amber">La apuesta: {hq.profile.stake}</p>}
        {next && (
          <Link href={next.href} className="group inline-flex min-h-11 items-center gap-2 rounded-xl bg-lime px-4 text-[14px] font-semibold text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_8px_24px_-8px_rgb(198_244_50/0.6)]">
            {next.cta}
            <span className="transition-transform group-hover:translate-x-0.5"><Icon name="arrow" size={16} /></span>
          </Link>
        )}
      </div>
    </section>
  );
}

const CELL: Record<L.GridState, string> = {
  done: "bg-lime text-ink font-bold shadow-[0_0_12px_-2px_rgb(198_244_50/0.6)]",
  missed: "bg-white/[0.04] text-mute/50 line-through",
  today: "ring-2 ring-inset ring-iris text-fg font-bold bg-iris/15",
  future: "border border-white/[0.05] text-mute/40",
};
const STATE_LABEL: Record<L.GridState, string> = { done: "cumplido", missed: "no cumplido", today: "hoy", future: "por venir" };

export function ChallengeMap({ hq, today }: { hq: HqState; today: string }) {
  const grid = L.challengeGrid(hq, today);
  const done = grid.filter((g) => g.state === "done").length;
  const elapsed = grid.filter((g) => g.state !== "future").length;
  return (
    <section aria-labelledby="map-h" className="flex flex-col gap-3 glass rounded-[22px] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="map-h" className="font-display text-[19px] font-semibold tracking-[-0.015em]">El mapa de tu remontada</h2>
        <span className="text-sm text-mute"><b className="text-accent">{done}</b> de {elapsed} días cumplidos</span>
      </div>
      <ol className="grid grid-cols-10 gap-1.5 md:grid-cols-[repeat(20,minmax(0,1fr))]">
        {grid.map((g) => (
          <li key={g.n} aria-label={`Día ${g.n}: ${STATE_LABEL[g.state]}`} className={`flex aspect-square items-center justify-center rounded-lg text-[11px] ${CELL[g.state]}`}>{g.n}</li>
        ))}
      </ol>
      <p className="text-[13px] text-mute">Cada cuadro verde es un día que ya nadie te quita. Los tachados son los que se fueron.</p>
    </section>
  );
}
