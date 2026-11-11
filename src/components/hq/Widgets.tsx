import Link from "next/link";
import * as L from "@/hq/logic";
import type { HqState } from "@/hq/schemas";

/** Anillo estilo Actividad: pista tenue + progreso redondeado. Se puede pasar de 100 % (segunda vuelta más clara). */
export function ActivityRing({ pct, size = 120, stroke = 13, color = "stroke-accent", track = "stroke-edge/40", children, label }: {
  pct: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode; label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, pct);
  const first = Math.min(v, 100);
  const extra = Math.min(Math.max(v - 100, 0), 100);
  return (
    <div role="img" aria-label={label} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={track} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - first / 100)} className={`wso-ring ${color}`} />
        {extra > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" opacity="0.55"
            strokeDasharray={c} strokeDashoffset={c * (1 - extra / 100)} className={`wso-ring ${color}`} />
        )}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  );
}

/** Tu foto (o inicial) envuelta en el anillo de misiones de hoy, con la racha en una insignia. */
export function StreakAvatar({ hq, today, size = 44 }: { hq: HqState; today: string; size?: number }) {
  const req = L.missionsFor(hq, today).filter((m) => m.required);
  const done = req.filter((m) => m.done).length;
  const streak = L.streak(hq, today);
  const inner = size - 10;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <ActivityRing pct={(done / Math.max(req.length, 1)) * 100} size={size} stroke={3.5} label={`Misiones de hoy: ${done} de ${req.length}`}>
        {hq.profile.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto local en data URL
          <img src={hq.profile.photo} alt="" width={inner} height={inner} className="rounded-full object-cover" style={{ width: inner, height: inner }} />
        ) : (
          <span className="flex items-center justify-center rounded-full bg-well font-display font-bold text-accent" style={{ width: inner, height: inner, fontSize: inner * 0.42 }}>
            {hq.profile.name.charAt(0)}
          </span>
        )}
      </ActivityRing>
      {streak > 0 && (
        <span aria-label={`Racha de ${streak} días`} className="absolute -bottom-1 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center gap-0.5 rounded-full bg-amber px-1 text-[10px] font-bold leading-none text-black ring-2 ring-[var(--bg)]">
          {streak}
        </span>
      )}
    </span>
  );
}

const DANGER: Record<L.DangerLevel, { bar: string; text: string; chip: string }> = {
  cumplido: { bar: "bg-accent", text: "text-accent", chip: "bg-accent/15 text-accent" },
  ok: { bar: "bg-accent", text: "text-fg", chip: "bg-accent/15 text-accent" },
  atento: { bar: "bg-amber", text: "text-amber", chip: "bg-amber/15 text-amber" },
  peligro: { bar: "bg-danger", text: "text-danger", chip: "bg-danger/15 text-danger" },
};

/** "Rapo a la 0": cuenta regresiva del reto + barra de peligro del día (verde → rojo). */
export function RapoMeter({ hq, today, hour, compact = false }: { hq: HqState; today: string; hour: number; compact?: boolean }) {
  const info = L.challengeInfo(hq.profile, today);
  const danger = L.dangerInfo(hq, today, hour);
  const tone = DANGER[danger.level];
  return (
    <section aria-label="Contador de la apuesta" className={`glass flex flex-col gap-3 rounded-3xl ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-mute">💈 Rapo a la 0</p>
          <p className="font-display text-[30px] font-bold leading-none tracking-tight">
            {info.finished ? "Hora del veredicto" : `${info.daysLeft} días`}
          </p>
          <p className="mt-1 text-[13px] text-mute">{info.finished ? "Toca grabar el video del resultado." : `para el veredicto · día ${info.dayNumber} de ${hq.profile.challengeDays}`}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${tone.chip}`}>{danger.title}</span>
      </div>
      <div>
        <div role="meter" aria-label="Peligro del día" aria-valuemin={0} aria-valuemax={100} aria-valuenow={danger.pct}
          className="relative h-2.5 overflow-hidden rounded-full bg-gradient-to-r from-accent/25 via-amber/25 to-danger/25">
          <div className={`h-full rounded-full transition-[width] duration-700 ${tone.bar}`} style={{ width: `${Math.max(danger.pct, danger.level === "cumplido" ? 100 : 4)}%` }} />
        </div>
        <p className={`mt-2 text-[14px] leading-snug ${tone.text}`}>{danger.detail}</p>
      </div>
    </section>
  );
}

/** "Daily Fuel & Lock": calorías del día en anillo, proteína, comidas y si el día ya quedó asegurado. */
export function DailyFuel({ hq, today }: { hq: HqState; today: string }) {
  const d = L.dayOf(hq, today);
  const kcal = L.kcalOf(d);
  const target = hq.profile.calorieTarget;
  const over = kcal > target;
  const locked = L.isDayComplete(hq, today);
  const protein = Math.round(L.proteinOf(d));
  const left = target - kcal;
  return (
    <section aria-labelledby="fuel-h" className="glass flex flex-col gap-4 rounded-3xl p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="fuel-h" className="text-[20px] font-semibold tracking-tight">Daily Fuel</h2>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${locked ? "bg-accent/15 text-accent" : "bg-well text-mute"}`}>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2" />{locked ? <path d="M8 11V7a4 4 0 0 1 8 0v4" /> : <path d="M8 11V7a4 4 0 0 1 7.5-2" />}
          </svg>
          {locked ? "Día asegurado" : "Sin asegurar"}
        </span>
      </div>
      <div className="flex items-center gap-5">
        <ActivityRing pct={(kcal / target) * 100} size={128} stroke={14} color={over ? "stroke-amber" : "stroke-accent"} label={`Calorías: ${kcal} de ${target}`}>
          <span className="font-display text-[26px] font-bold leading-none tracking-tight">{kcal.toLocaleString("es-MX")}</span>
          <span className="text-[11px] text-mute">de {target.toLocaleString("es-MX")} kcal</span>
        </ActivityRing>
        <dl className="grid min-w-0 flex-1 gap-2.5 text-[14px]">
          <div className="flex items-baseline justify-between gap-2"><dt className="text-mute">{over ? "Te pasaste" : "Te quedan"}</dt><dd className={`font-semibold ${over ? "text-amber" : ""}`}>{Math.abs(left).toLocaleString("es-MX")} kcal</dd></div>
          <div className="flex items-baseline justify-between gap-2"><dt className="text-mute">Proteína</dt><dd className="font-semibold">{protein} g</dd></div>
          <div className="flex items-baseline justify-between gap-2"><dt className="text-mute">Comidas</dt><dd className="font-semibold">{d.meals.length} / {L.MIN_MEALS} mín.</dd></div>
          <div className="flex items-baseline justify-between gap-2"><dt className="text-mute">Entrenamiento</dt><dd className={`font-semibold ${d.trainingDone ? "text-accent" : ""}`}>{d.trainingDone ? "Hecho" : "Pendiente"}</dd></div>
        </dl>
      </div>
      <Link href="#comidas" className="text-[14px] font-semibold text-accent">Registrar comida con foto →</Link>
    </section>
  );
}
