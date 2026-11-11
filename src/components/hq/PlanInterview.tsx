"use client";

import Link from "next/link";
import { useState } from "react";
import * as L from "@/hq/logic";
import type { HqState, Plan } from "@/hq/schemas";
import { actions, useHq } from "@/hq/store";
import { Bar, btn, Card, H2, Loading, PageTitle } from "./ui";
import { GhostTip } from "./Journal";

export function PlanInterview() {
  const hq = useHq();
  if (!hq) return <Loading />;
  return <PlanView hq={hq} />;
}

const bubble = "max-w-xl self-start rounded-[20px] rounded-bl-md border border-white/[0.07] bg-white/[0.06] px-4 py-2.5 text-[16px] leading-snug";
const mine = "max-w-sm self-end rounded-[20px] rounded-br-md bg-lime px-4 py-2.5 text-[16px] font-medium text-ink";

export function PlanView({ hq, initialAnswers = [] }: { hq: HqState; initialAnswers?: string[] }) {
  const [redo, setRedo] = useState(false);
  const [answers, setAnswers] = useState<string[]>(initialAnswers);
  const interviewing = !hq.plan || redo;
  const step = answers.length;
  const draft = L.buildPlan(answers, new Date().toISOString());
  const current = L.INTERVIEW[step];
  const label = (i: number, value: string) => L.INTERVIEW[i]?.options.find((o) => o.value === value)?.label ?? value;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Plan de ataque" sub="El Estratega arma tu semana" />
      <GhostTip name={hq.profile.mascotName} text={hq.plan ? "El plan solo se cambia con 2 semanas de datos y si cumpliste. Lo que no se cumple no se ajusta: se arregla la constancia." : "4 preguntas y te armo la semana completa. Después cada día te dice qué toca."} />

      {!interviewing && hq.plan ? (
        <Card aria-labelledby="plan-h" className="flex flex-col gap-4">
          <H2 id="plan-h">Tu plan activo</H2>
          <Week plan={hq.plan} />
          <Rules hq={hq} />
          <button type="button" className={`${btn.ghost} self-start`} onClick={() => { setAnswers([]); setRedo(true); }}>Rehacer la entrevista</button>
        </Card>
      ) : (
        <Card aria-label="Entrevista con el Estratega" className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-xs text-mute">{draft ? "Plan listo" : `Pregunta ${step + 1} de ${L.INTERVIEW.length}`}</span>
            <div className="flex-1"><Bar pct={(step / L.INTERVIEW.length) * 100} label="Avance de la entrevista" /></div>
          </div>
          <p className={bubble}>Te hago 4 preguntas rápidas. Con eso armo tu semana y les digo a los demás agentes qué hacer.</p>
          {answers.map((a, i) => (
            <div key={i} className="flex flex-col gap-3">
              <p className={bubble}>{L.INTERVIEW[i]?.q}</p>
              <p className={mine}>{label(i, a)}</p>
            </div>
          ))}
          {current && !draft && (
            <>
              <div className={bubble}>
                <p className="font-semibold">{current.q}</p>
                <p className="mt-1 text-sm text-mute">{current.why}</p>
              </div>
              <div role="group" aria-label="Opciones de respuesta" className="flex flex-wrap gap-2">
                {current.options.map((o) => <button key={o.value} type="button" className={btn.chip} onClick={() => setAnswers([...answers, o.value])}>{o.label}</button>)}
              </div>
            </>
          )}
          {draft && (
            <>
              <p className={bubble}>Listo. Esta es tu semana. Si la aceptas, tus misiones de cada día salen de aquí.</p>
              <Week plan={draft} />
              <div className="flex flex-wrap gap-2">
                <Link href="/" className={btn.primary} onClick={() => actions.setPlan(draft)}>Aceptar plan</Link>
                <button type="button" className={btn.ghost} onClick={() => setAnswers([])}>Volver a contestar</button>
                {hq.plan && <button type="button" className={btn.ghost} onClick={() => setRedo(false)}>Cancelar</button>}
              </div>
            </>
          )}
          {step > 0 && !draft && <button type="button" className="self-start text-sm text-mute underline" onClick={() => setAnswers(answers.slice(0, -1))}>Cambiar la respuesta anterior</button>}
        </Card>
      )}
    </div>
  );
}

function Week({ plan }: { plan: Plan }) {
  return (
    <ol aria-label="Semana" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {L.planWeek(plan).map((d) => (
        <li key={d.day} className={`flex flex-col gap-1 rounded-2xl p-3 ${d.gym ? "border border-lime/25 bg-lime/10" : "border border-white/[0.06] bg-white/[0.03]"}`}>
          <span className="text-xs font-semibold text-mute">{d.day}{d.gym ? " · gym" : ""}</span>
          <span className="text-sm font-semibold leading-snug">{d.main}</span>
          {d.extra && <span className="text-xs leading-snug text-mute">{d.extra}</span>}
        </li>
      ))}
    </ol>
  );
}

function Rules({ hq }: { hq: HqState }) {
  return (
    <div className="rounded-2xl bg-well p-4 text-[15px]">
      <p className="mb-2 font-semibold">Reglas del plan (conservador a propósito)</p>
      <ul className="flex list-inside list-disc flex-col gap-1 text-fg/85">
        <li>Meta de bajada: 0.5 a 0.8 kg por semana. Nunca más de {L.MAX_LOSS_PER_WEEK} kg.</li>
        <li>Día cumplido: entrenar, registrar al menos {L.MIN_MEALS} comidas y no pasarte de {hq.profile.calorieTarget.toLocaleString("es-MX")} kcal.</li>
        <li>El plan solo se ajusta con dos semanas de datos y si sí cumpliste.</li>
        <li>Si tu nutriólogo te da un plan, el suyo manda: cambia tu meta de calorías en Ajustes.</li>
      </ul>
    </div>
  );
}
