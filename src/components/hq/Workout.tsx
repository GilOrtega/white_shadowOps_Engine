"use client";

import { useEffect, useState } from "react";
import * as L from "@/hq/logic";
import type { HqState } from "@/hq/schemas";
import { actions, parseNumber } from "@/hq/store";
import * as T from "@/hq/training";
import * as X from "@/hq/exercises";
import { Icon } from "./ui";

/** Entrenamiento de hoy: rutina completa con registro por serie, progresión y descanso cronometrado. */
export function Workout({ hq, today }: { hq: HqState; today: string }) {
  const w = T.workoutFor(hq.plan, today, hq.profile.startDate);
  const day = L.dayOf(hq, today);
  const [warm, setWarm] = useState(false);
  const loggedSets = w.rx.reduce((n, r) => n + (day.lifts[r.id]?.reps.filter((x) => x > 0).length ?? 0), 0);
  const totalSets = w.rx.reduce((n, r) => n + r.sets, 0);
  const vol = T.volumeOf(day.lifts);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="rounded-full bg-accent/15 px-2.5 py-1 font-semibold text-accent">Semana {w.phase.week} · {w.phase.name}</span>
        <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-mute">{w.split}</span>
        {w.kind === "gym" && <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-mute">≈ {w.minutes} min</span>}
      </div>
      <div>
        <p className="text-[16px] font-semibold leading-tight">{w.title}</p>
        <p className="text-[13px] text-mute">{w.detail}</p>
      </div>
      <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-[13px] text-fg/85">{w.phase.note}</p>

      {w.kind === "gym" ? (
        <>
          <button type="button" onClick={() => setWarm(!warm)} className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-left text-[14px] font-semibold">
            🔥 Calentamiento (8 min)<span className={`transition-transform ${warm ? "rotate-90" : ""}`}><Icon name="chevron" size={16} /></span>
          </button>
          {warm && <ul className="ml-5 list-disc text-[13px] text-fg/85">{w.warmup.map((x) => <li key={x}>{x}</li>)}</ul>}

          <ol className="flex flex-col gap-2.5">
            {w.rx.map((r, i) => <ExerciseRow key={r.id + i} n={i + 1} r={r} hq={hq} today={today} phase={w.phase} />)}
          </ol>

          {w.finisher && (
            <div className="rounded-xl border border-white/[0.07] px-3 py-2.5 text-[13px]">
              <p className="font-semibold">⚡ Al final: {w.finisher.title}</p>
              <p className="text-mute">{w.finisher.detail}</p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="tnum text-[12px] text-mute">{loggedSets}/{totalSets} series registradas{vol ? ` · volumen ${Math.round(vol).toLocaleString("es-MX")} kg` : ""}</span>
            <button type="button" onClick={() => actions.setTraining(today, !day.trainingDone)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold ${day.trainingDone ? "bg-white/[0.08] text-accent" : "bg-lime text-ink"}`}>
              <Icon name="check" size={16} strokeWidth={2.6} />{day.trainingDone ? "Entrenamiento hecho" : "Terminar entrenamiento"}
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
            <span aria-hidden="true" className="text-2xl">🚶</span>
            <span className="text-[14px]"><b className="tnum">{w.steps.toLocaleString("es-MX")}</b> pasos hoy · paso ligero, cuenta para el déficit</span>
          </div>
          <p className="text-[13px] font-semibold">Movilidad (10 min)</p>
          <ul className="ml-5 list-disc text-[13px] text-fg/85">{w.mobility.map((x) => <li key={x}>{x}</li>)}</ul>
          <button type="button" onClick={() => actions.setTraining(today, !day.trainingDone)} className={`self-start rounded-xl px-4 py-2 text-[14px] font-semibold ${day.trainingDone ? "bg-white/[0.08] text-accent" : "bg-lime text-ink"}`}>
            {day.trainingDone ? "✓ Hecho" : "Ya caminé"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Técnica: GIF, pasos en español y opciones para cambiar el ejercicio (p. ej. si la máquina está ocupada). */
function Technique({ id, swap, cue, fallbackAlt }: { id: string; swap: string | null; cue: string; fallbackAlt: string }) {
  const media = X.mediaFor(id, swap);
  if (!media) return <p className="text-[12px] text-mute">💡 {cue}. Si no hay máquina: {fallbackAlt}.</p>;
  const primary = X.mediaFor(id)?.id;
  const alts = X.alternativesFor(id, swap).filter((a) => !swap || a.id !== primary);
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-black/25 p-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* eslint-disable-next-line @next/next/no-img-element -- GIF animado, next/image no lo optimiza */}
        <img src={X.gifUrl(media)} alt={`Cómo se hace: ${media.name}`} width={180} height={180} loading="lazy" className="mx-auto h-[180px] w-[180px] shrink-0 rounded-xl bg-white sm:mx-0" />
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[12px] text-mute">
            <span className="font-semibold text-fg">{media.target}</span>
            {media.secondary.length > 0 && ` · también ${media.secondary.join(", ").toLowerCase()}`} · {media.equipment}
          </p>
          {!swap && <p className="text-[13px] text-accent">💡 {cue}</p>}
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13px] leading-snug text-fg/85">
            {media.steps.map((st) => <li key={st}>{st}</li>)}
          </ol>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold text-mute">¿Ocupado o sin equipo? Cámbialo por:</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {swap && (
            <button type="button" onClick={() => actions.swapExercise(id, null)} className="flex shrink-0 items-center rounded-xl border border-lime/40 bg-lime/10 px-3 text-[13px] font-semibold text-lime">
              Volver a {X.mediaFor(id)?.name ?? "el de la rutina"}
            </button>
          )}
          {alts.map((a) => (
            <button key={a.id} type="button" onClick={() => actions.swapExercise(id, a.id)}
              className="flex w-28 shrink-0 flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-2 text-center hover:border-white/25">
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura estática */}
              <img src={X.thumbUrl(a)} alt="" width={64} height={64} loading="lazy" className="h-16 w-16 rounded-lg bg-white object-cover" />
              <span className="text-[11px] font-semibold leading-tight">{a.name}</span>
              <span className={`text-[10px] ${a.home ? "text-mint" : "text-mute"}`}>{a.home ? "En casa" : a.equipment}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-mute/70">Al cambiarlo, su peso y reps se llevan aparte. {X.MEDIA_CREDIT}.</p>
      </div>
    </div>
  );
}

function ExerciseRow({ n, r, hq, today, phase }: { n: number; r: T.Rx; hq: HqState; today: string; phase: T.Phase }) {
  const lift = T.LIB[r.id]!;
  const swap = hq.exerciseSwaps[r.id] ?? null;
  const media = X.mediaFor(r.id, swap);
  const key = T.logKey(r.id, media && swap ? swap : null);
  const rk = { ...r, id: key };
  const name = swap && media ? media.name : lift.name;
  const log = L.dayOf(hq, today).lifts[key] ?? { kg: null, reps: [] };
  const last = T.lastLog(hq, key, today);
  const [kgText, setKgText] = useState(log.kg === null ? "" : String(log.kg));
  const [rest, setRest] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const done = log.reps.filter((x) => x > 0).length;
  const unit = r.unit === "seg" ? "s" : "reps";

  useEffect(() => {
    if (rest === null) return;
    if (rest <= 0) {
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {
        /* sin vibración */
      }
      const id = window.setTimeout(() => setRest(null), 1500);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setRest(rest - 1), 1000);
    return () => window.clearTimeout(id);
  }, [rest]);

  const saveKg = () => {
    const v = parseNumber(kgText);
    actions.setLift(today, key, { kg: v === null ? null : Math.max(0, Math.min(600, v)) });
  };

  return (
    <li className={`flex flex-col gap-2 rounded-2xl border p-3 ${done >= r.sets ? "border-accent/30 bg-accent/[0.05]" : "border-white/[0.07] bg-white/[0.02]"}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold ${done >= r.sets ? "bg-accent text-ink" : "bg-white/[0.08]"}`}>{done >= r.sets ? "✓" : n}</span>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
          {media && (
            // eslint-disable-next-line @next/next/no-img-element -- miniatura estática de 180 px
            <img src={X.thumbUrl(media)} alt="" width={44} height={44} loading="lazy" className="h-11 w-11 shrink-0 rounded-lg bg-white object-cover" />
          )}
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold leading-tight">{name}</span>
            <span className="block text-[12px] text-mute">{r.sets}×{r.reps[0]}–{r.reps[1]} {unit} · descanso {Math.floor(r.rest / 60)}:{String(r.rest % 60).padStart(2, "0")} · {media?.target ?? lift.muscle}</span>
            <span className="text-[12px] font-semibold text-iris">{open ? "Ocultar técnica" : "Ver técnica y cambiar"}</span>
          </span>
        </button>
        {r.unit !== "seg" && (
          <label className="flex shrink-0 items-center gap-1 text-[12px] text-mute">
            <input aria-label={`Peso en ${name}`} inputMode="decimal" value={kgText} placeholder={last?.log.kg ? String(last.log.kg) : "0"}
              onChange={(e) => setKgText(e.target.value)} onBlur={saveKg}
              className="w-16 rounded-lg bg-white/[0.07] px-2 py-1.5 text-right text-[14px] font-semibold text-fg outline-none focus:ring-1 focus:ring-accent/50" />kg
          </label>
        )}
      </div>
      <p className="text-[12px] text-accent/90">{T.suggestion(hq, rk, today, phase)}</p>
      {open && <Technique id={r.id} swap={swap} cue={lift.cue} fallbackAlt={lift.alt} />}
      <div className="flex flex-wrap items-center gap-1.5">
        {Array.from({ length: r.sets }, (_, i) => {
          const v = log.reps[i] ?? 0;
          return (
            <input key={i} aria-label={`${name}, serie ${i + 1} (${unit})`} inputMode="numeric" value={v || ""} placeholder={`S${i + 1}`}
              onChange={(e) => {
                const reps = Number(e.target.value.replace(/\D/g, "")) || 0;
                actions.setLift(today, key, { setIndex: i, reps });
                if (reps > 0 && !log.reps[i]) setRest(r.rest);
              }}
              className={`h-9 w-12 rounded-lg text-center text-[14px] font-semibold outline-none focus:ring-1 focus:ring-accent/50 ${v ? "bg-accent/20 text-fg" : "bg-white/[0.06] text-mute"}`} />
          );
        })}
        <button type="button" onClick={() => setRest(rest === null ? r.rest : null)} className={`ml-auto inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold ${rest !== null ? "bg-sky/20 text-sky" : "bg-white/[0.06] text-mute"}`}>
          ⏱ {rest === null ? "Descanso" : rest > 0 ? `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, "0")}` : "¡Va!"}
        </button>
      </div>
    </li>
  );
}
