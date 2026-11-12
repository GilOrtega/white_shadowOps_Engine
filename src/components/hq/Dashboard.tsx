"use client";

import Link from "next/link";
import { useState } from "react";
import type { CoachAdvice, CoachRequest } from "@/hq/agents/coach";
import { callAgent } from "@/hq/client";
import * as L from "@/hq/logic";
import type { HqState } from "@/hq/schemas";
import { actions, parseNumber, useHq } from "@/hq/store";
import { useHour, useToday } from "@/hq/useToday";
import { CommandCenter, WorkMoney } from "./CommandCenter";
import { ChallengeMap, Hero } from "./Hero";
import { Mascot } from "./Mascot";
import { TodayCapture } from "./Journal";
import { MealLogger } from "./MealLogger";
import { Avatar, Bar, btn, Card, Check, group, H2, Icon, input, Loading, Pill, row } from "./ui";
import { DailyFuel, RapoMeter } from "./Widgets";
import { Workout } from "./Workout";

export function Dashboard() {
  const hq = useHq();
  const today = useToday();
  const hour = useHour();
  if (!hq || !today || hour === null) return <Loading />;
  return <DashboardView hq={hq} today={today} hour={hour} />;
}

const longDate = (date: string) => {
  const s = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(L.parseDate(date));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const shortDate = (date: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(L.parseDate(date));

export function DashboardView({ hq, today, hour = 12 }: { hq: HqState; today: string; hour?: number }) {
  const info = L.challengeInfo(hq.profile, today);
  const series = L.weightSeries(hq);
  const rate = L.weeklyRate(series);
  const trend = series.at(-1)?.trend ?? hq.profile.startWeightKg;
  const prog = L.progress(hq);
  const change = trend - hq.profile.startWeightKg;
  const day = L.dayOf(hq, today);
  const kcal = L.kcalOf(day);

  return (
    <div className="flex flex-col gap-6">
      <CommandCenter hq={hq} today={today} hour={hour} dateLabel={longDate(today)} />

      <SectionTitle id="cuerpo" tone="text-accent" title="Cuerpo" sub="El reto · si fallo, me rapo" />
      <Hero hq={hq} today={today} />
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <RapoMeter hq={hq} today={today} hour={hour} />
        <DailyFuel hq={hq} today={today} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Mascot hq={hq} today={today} hour={hour} />
        <TodayCapture today={today} />
      </div>
      <p className="glass rounded-2xl px-4 py-3 text-[15px] leading-snug"><span className="font-semibold text-iris">Coach.</span> {L.coachNote(hq, today)}</p>

      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Kpi label="Peso (tendencia 7 días)" value={L.fmtKg(trend)} pct={null}
          sub={`${rate === null ? "Aún sin ritmo semanal" : `${rate > 0 ? "+" : ""}${rate.toFixed(1)} kg por semana`} · ${hq.profile.goalWeightKg === null ? "sin meta" : `meta ${L.fmtKg(hq.profile.goalWeightKg)}`}`} />
        <Kpi label="Desde el día 1" value={`${change > 0 ? "+" : ""}${change.toFixed(1)} kg`} pct={null}
          sub={change < -0.05 ? "Eso ya no regresa. Sigue." : "La báscula se mueve cuando cumples días."} />
        <Kpi label="Días cumplidos" value={`${prog.completeDays} de ${info.dayNumber}`} pct={(prog.completeDays / info.dayNumber) * 100} tone="sky"
          sub={`Reto al ${info.pct}% · termina el ${shortDate(info.endDate)}`} />
        <Kpi label="Calorías de hoy" value={`${kcal.toLocaleString("es-MX")} / ${hq.profile.calorieTarget.toLocaleString("es-MX")}`}
          pct={(kcal / hq.profile.calorieTarget) * 100} tone={kcal > hq.profile.calorieTarget ? "amber" : "accent"}
          sub={`${day.meals.length} ${day.meals.length === 1 ? "comida" : "comidas"} · ${Math.round(L.proteinOf(day))} g proteína`} />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Missions hq={hq} today={today} />
        <Questions hq={hq} today={today} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div id="comidas" className="scroll-mt-6"><MealLogger hq={hq} today={today} /></div>
        <CoachCard hq={hq} today={today} />
      </div>

      <ChallengeMap hq={hq} today={today} />

      <SectionTitle id="vida" tone="text-sky" title="Trabajo, dinero y marca" sub="Lo que paga las cuentas y lo que te hace crecer" />
      <WorkMoney hq={hq} today={today} />

      <Team hq={hq} today={today} />
    </div>
  );
}

function Kpi({ label, value, sub, pct, tone }: { label: string; value: string; sub: string; pct: number | null; tone?: "accent" | "lime" | "sky" | "amber" }) {
  return (
    <section className="glass flex flex-col gap-1.5 rounded-[20px] p-4">
      <span className="text-xs text-mute">{label}</span>
      <span className="tnum font-display text-[26px] font-bold leading-tight tracking-[-0.03em]">{value}</span>
      {pct !== null && <Bar pct={pct} tone={tone} label={label} />}
      <span className="text-xs text-mute">{sub}</span>
    </section>
  );
}

function Missions({ hq, today }: { hq: HqState; today: string }) {
  const missions = L.missionsFor(hq, today);
  const required = missions.filter((m) => m.required);
  const done = required.filter((m) => m.done).length;
  const complete = done === required.length;
  const toggle = (id: L.Mission["id"], next: boolean) => (id === "train" ? actions.setTraining(today, next) : actions.setClip(today, next));
  return (
    <Card id="misiones" aria-labelledby="mis-h" className="flex scroll-mt-6 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <H2 id="mis-h">Plan de ataque de hoy</H2>
        <span className="tnum text-sm font-semibold text-lime">{done} de {required.length}</span>
      </div>
      <ul className={group}>
        {missions.map((m) => {
          const body = (
            <>
              <Check done={m.done} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`text-[16px] font-medium leading-snug ${m.done ? "text-mute line-through" : ""}`}>{m.title}</span>
                <span className="text-[13px] text-mute">{m.agent}: {m.detail}</span>
              </span>
              {m.auto && <span className="shrink-0 text-[12px] text-mute">sola</span>}
              {!m.required && <span className="shrink-0 rounded-full bg-sky/15 px-2 py-0.5 text-[12px] font-medium text-sky">+{L.XP.clip} XP</span>}
            </>
          );
          return (
            <li key={m.id}>
              {m.auto ? <div className={row}>{body}</div> : (
                <button type="button" aria-pressed={m.done} onClick={() => toggle(m.id, !m.done)} className={row}>{body}</button>
              )}
            </li>
          );
        })}
      </ul>
      <p role="status" className={`text-sm ${complete ? "font-semibold text-lime" : "text-mute"}`}>
        {complete ? `Día cumplido: +${L.XP.day} XP y la racha sigue.` : "Las que dicen “sola” se marcan al registrar tus comidas."}
      </p>
    </Card>
  );
}

function Questions({ hq, today }: { hq: HqState; today: string }) {
  const questions = L.agentQuestions(hq, today);
  return (
    <Card aria-labelledby="q-h" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <H2 id="q-h">Tus agentes preguntan</H2>
        <span className="text-sm text-mute">{questions.length === 0 ? "Todo respondido" : `${questions.length} pendiente${questions.length === 1 ? "" : "s"}`}</span>
      </div>
      {questions.length === 0 && <p className="text-sm text-mute">Nadie te necesita ahorita. A cumplir las misiones.</p>}
      {questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-2.5 rounded-2xl bg-well p-4">
          <div className="flex items-center gap-2.5"><Avatar name={q.agent} /><span className="text-sm font-semibold">{q.agent}</span></div>
          <p className="text-[16px] leading-snug">{q.text}</p>
          {q.kind === "link" && <Link href={q.href} className={`${btn.primary} self-start`}>{q.cta}</Link>}
          {q.kind === "choice" && (
            <div className="flex flex-wrap gap-2">
              {q.options.map((o) => <button key={o.value} type="button" className={btn.chip} onClick={() => actions.setFeeling(today, o.value)}>{o.label}</button>)}
            </div>
          )}
          {q.kind === "number" && (
            <NumberAnswer label={q.text} unit={q.unit} onSave={(n) => (q.id === "weight" ? actions.setWeight(today, n) : actions.updateProfile({ goalWeightKg: n }))} />
          )}
        </div>
      ))}
    </Card>
  );
}

export function NumberAnswer({ label, unit, onSave, min = 30, max = 300 }: { label: string; unit: string; onSave: (n: number) => void; min?: number; max?: number }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState(false);
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => {
      e.preventDefault();
      const n = parseNumber(text);
      if (n === null || n < min || n > max) return setErr(true);
      onSave(Math.round(n * 100) / 100);
      setText("");
      setErr(false);
    }}>
      <input aria-label={label} aria-invalid={err} inputMode="decimal" className={`${input} max-w-28`} placeholder={unit} value={text} onChange={(e) => setText(e.target.value)} />
      <button type="submit" className={btn.ghost}>Guardar</button>
      {err && <span role="alert" className="text-sm text-amber">Entre {min} y {max} {unit}.</span>}
    </form>
  );
}

function coachRequest(hq: HqState, today: string): CoachRequest {
  const series = L.weightSeries(hq);
  return {
    dayNumber: L.challengeInfo(hq.profile, today).dayNumber,
    challengeDays: hq.profile.challengeDays,
    startWeightKg: hq.profile.startWeightKg,
    goalWeightKg: hq.profile.goalWeightKg,
    calorieTarget: hq.profile.calorieTarget,
    trendKg: series.at(-1)?.trend ?? null,
    weeklyRateKg: L.weeklyRate(series),
    streak: L.streak(hq, today),
    plan: hq.plan ? { goal: hq.plan.goal, gymDaysPerWeek: hq.plan.gymDays.length } : null,
    days: L.lastDays(hq, today, 14),
  };
}

const ADJUST: Record<CoachAdvice["adjustment"], string> = {
  ninguno: "Sin cambios al plan",
  menos_kcal: "Ajuste: 150 kcal menos al día",
  mas_kcal: "Ajuste: sube un poco las calorías",
  mas_caminata: "Ajuste: 10 minutos más de caminata",
  bajar_intensidad: "Ajuste: baja la intensidad y duerme más",
};

function CoachCard({ hq, today }: { hq: HqState; today: string }) {
  const [busy, setBusy] = useState(false);
  const [advice, setAdvice] = useState<CoachAdvice | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function ask() {
    setBusy(true);
    setMsg(null);
    const res = await callAgent<CoachAdvice>("/api/agents/coach", coachRequest(hq, today), hq.accessKey);
    if (res.ok) setAdvice(res.data);
    else setMsg(res.message);
    setBusy(false);
  }
  return (
    <Card aria-labelledby="coach-h" className="flex flex-col gap-3">
      <H2 id="coach-h">Entrenamiento de hoy</H2>
      <Workout hq={hq} today={today} />
      <p className="text-xs text-mute">Si un ejercicio te da dolor agudo o en la articulación, se para y se revisa con un profesional.</p>
      <div className="mt-1 flex flex-col gap-2 border-t border-line pt-3">
        <button type="button" className={`${btn.ai} self-start`} disabled={busy} onClick={() => void ask()}>
          <Icon name="sparkle" size={16} />
          {busy ? "El Coach está revisando tus 14 días…" : "Pedir análisis al Coach (IA)"}
        </button>
        {msg && <p role="status" className="text-sm text-amber">{msg}</p>}
        {advice && (
          <div role="status" className="flex flex-col gap-2 rounded-2xl bg-well p-4 text-[15px]">
            <p className="font-display text-base font-semibold">{advice.headline}</p>
            <ul className="flex list-inside list-disc flex-col gap-1 text-fg/85">{advice.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
            <p><span className="font-semibold text-lime">Hoy:</span> {advice.actionToday}</p>
            <p className="text-xs text-mute">{ADJUST[advice.adjustment]}{advice.guardrail ? ` · ${advice.guardrail}` : ""}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function Team({ hq, today }: { hq: HqState; today: string }) {
  const cards = L.agentCards(hq, today);
  return (
    <section aria-labelledby="team-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H2 id="team-h">Tu equipo de agentes</H2>
        <span className="text-sm text-mute">Qué lleva hecho cada uno hoy</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((a) => (
          <article key={a.id} className="glass flex flex-col gap-3 rounded-[20px] p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={a.name} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-[15px] font-semibold">{a.name}</span>
                  <span className="truncate text-xs text-mute">{a.role}</span>
                </span>
              </div>
              <Pill status={a.status}>{a.statusLabel}</Pill>
            </div>
            <p className="text-sm leading-snug text-fg/85">{a.task}</p>
            <Bar pct={a.pct} tone={a.status === "done" ? "accent" : a.status === "needs" && a.pct > 0 ? "amber" : "iris"} label={`Avance de ${a.name}`} />
          </article>
        ))}
      </div>
    </section>
  );
}

function SectionTitle({ id, title, sub, tone }: { id: string; title: string; sub: string; tone: string }) {
  return (
    <div id={id} className="mt-2 flex scroll-mt-6 items-baseline gap-3 border-b border-white/[0.06] pb-2">
      <h2 className={`font-display text-[22px] font-bold tracking-[-0.02em] ${tone}`}>{title}</h2>
      <p className="truncate text-[13px] text-mute">{sub}</p>
    </div>
  );
}
