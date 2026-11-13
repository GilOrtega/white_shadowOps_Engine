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
import { Fold } from "./Fold";
import { Hero } from "./Hero";
import { DayChecklist, GymBanner, SombraEvolution, TodayHeader } from "./Flames";
import { NutriTip } from "../nutri/Nutri";
import { HabitsToday } from "./Proactive";
import { Mascot } from "./Mascot";
import { TodayCapture } from "./Journal";
import { MealLogger } from "./MealLogger";
import { Avatar, Bar, btn, Card, H2, Icon, input, Loading, PageTitle, Pill } from "./ui";
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

export function DashboardView({ hq, today, hour = 12 }: { hq: HqState; today: string; hour?: number }) {
  const day = L.dayOf(hq, today);
  const kcal = L.kcalOf(day);
  const training = L.trainingFor(hq.plan, today, hq.profile.startDate);
  const gymDay = training.kind === "gym";
  return (
    <div className="flex flex-col gap-5">
      <TodayHeader hq={hq} today={today} dateLabel={longDate(today)} />

      <DayChecklist hq={hq} today={today} />

      <Fold id="gym" title={gymDay ? "Gym de hoy" : "Movimiento de hoy"} tone="text-lime" defaultOpen={gymDay}
        summary={`${training.title}${day.trainingDone ? " · hecho ✓" : ""}`}>
        <GymBanner hq={hq} today={today} hour={hour} />
        <CoachCard hq={hq} today={today} />
      </Fold>

      <Fold id="comidas-fold" title="Comidas de hoy" tone="text-accent"
        summary={`${kcal.toLocaleString("es-MX")} de ${hq.profile.calorieTarget.toLocaleString("es-MX")} kcal · ${day.meals.length} ${day.meals.length === 1 ? "comida" : "comidas"}`}>
        <NutriTip hq={hq} today={today} hour={hour} />
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div id="comidas" className="scroll-mt-6"><MealLogger hq={hq} today={today} /></div>
          <DailyFuel hq={hq} today={today} />
        </div>
      </Fold>

    </div>
  );
}

/** Cuerpo → Progreso: la evolución de Sombra, la apuesta y lo que se registra del cuerpo (arriba de la gráfica de peso). */
export function BodyTop({ hq, today, hour }: { hq: HqState; today: string; hour: number }) {
  return (
    <div className="flex flex-col gap-4">
      <Hero hq={hq} today={today} />
      <SombraEvolution hq={hq} today={today} />
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <RapoMeter hq={hq} today={today} hour={hour} />
        <Questions hq={hq} today={today} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Mascot hq={hq} today={today} hour={hour} />
        <TodayCapture today={today} />
      </div>
      <p className="glass rounded-2xl px-4 py-3 text-[15px] leading-snug"><span className="font-semibold text-iris">Coach.</span> {L.coachNote(hq, today)}</p>
    </div>
  );
}

/** Agentes → Ideas y equipo. */
export function IdeasTeam() {
  const hq = useHq();
  const today = useToday();
  const hour = useHour();
  if (!hq || !today || hour === null) return <Loading />;
  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Ideas y equipo" sub="Lo que propone tu Sombra y quién hace qué" />
      <CommandCenter hq={hq} today={today} hour={hour} dateLabel={longDate(today)} part="propone" />
      <Team hq={hq} today={today} />
    </div>
  );
}

/** Yo → Mi vida: trabajo, dinero, tus 5 facetas y tu historia. */
export function LifeView() {
  const hq = useHq();
  const today = useToday();
  const hour = useHour();
  if (!hq || !today || hour === null) return <Loading />;
  const dateLabel = longDate(today);
  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Mi vida" sub="Trabajo, dinero y el resto de tus facetas" />
      <WorkMoney hq={hq} today={today} />
      <CommandCenter hq={hq} today={today} hour={hour} dateLabel={dateLabel} part="mando" />
      <CommandCenter hq={hq} today={today} hour={hour} dateLabel={dateLabel} part="historia" />
    </div>
  );
}

/** Cuerpo → Hábitos. */
export function HabitsPage() {
  const hq = useHq();
  const today = useToday();
  const hour = useHour();
  if (!hq || !today || hour === null) return <Loading />;
  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Hábitos" sub="Lo que repites todos los días, con su recordatorio" />
      <HabitsToday hq={hq} today={today} hhmm={`${String(hour).padStart(2, "0")}:00`} />
    </div>
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

export function Team({ hq, today }: { hq: HqState; today: string }) {
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
