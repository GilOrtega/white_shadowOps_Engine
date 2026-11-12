"use client";

import Link from "next/link";
import { useState } from "react";
import { callAgent } from "@/hq/client";
import type * as F from "@/hq/facets";
import * as H from "@/hq/habits";
import * as I from "@/hq/insights";
import type { HqState } from "@/hq/schemas";
import { actions } from "@/hq/store";
import { TONE } from "./CommandCenter";
import { MascotFace } from "./Mascot";
import { btn, Icon, input } from "./ui";
import { ActivityRing } from "./Widgets";

// --- Sombra propone (agente proactivo) ----------------------------------------------------
export function applyProposal(p: I.Proposal, hq: HqState, today: string) {
  const a = p.action;
  if (a.kind === "calories") actions.updateProfile({ calorieTarget: Math.max(1500, Math.min(5000, hq.profile.calorieTarget + a.delta)) });
  else if (a.kind === "focusGoal") actions.setWork({ focusGoal: a.value });
  else if (a.kind === "habit") actions.addHabit(a.preset, today);
  else if (a.kind === "habitTime") actions.updateHabit(a.habitId, { time: a.time });
  actions.dismiss(p.id, today);
}

type AiIdea = { title: string; why: string; facet: F.FacetId; habit: { title: string; emoji: string; time: string | null; anchor: string } | null };

export function Proposals({ hq, today, list }: { hq: HqState; today: string; list: I.Proposal[] }) {
  const [all, setAll] = useState(false);
  const [ai, setAi] = useState<AiIdea[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const shown = all ? list : list.slice(0, 3);

  async function askAi() {
    setBusy(true);
    setErr(null);
    const res = await callAgent<{ ideas: AiIdea[] }>("/api/agents/ideas", { context: ideasContext(hq, today, list) }, hq.accessKey);
    setBusy(false);
    if (res.ok) setAi(res.data.ideas);
    else setErr(res.code === "NOT_CONFIGURED" || res.code === "UNAUTHORIZED" ? "Para ideas con IA falta tu clave de acceso (Ajustes). Las propuestas de arriba no usan IA y siempre funcionan." : res.message);
  }

  return (
    <section aria-labelledby="props-h" className="glass flex flex-col gap-3 rounded-[26px] p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-end justify-center rounded-2xl bg-iris/15"><MascotFace mood={list.some((p) => p.priority === 0) ? "preocupado" : "listo"} size={38} /></span>
        <div className="min-w-0 flex-1">
          <h2 id="props-h" className="text-[17px] font-semibold tracking-tight">Sombra propone</h2>
          <p className="text-[12px] text-mute">Revisa tus datos y te sugiere. Nada cambia hasta que aceptas.</p>
        </div>
        <button type="button" onClick={() => void askAi()} disabled={busy} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-iris/15 px-3 text-[13px] font-semibold text-iris disabled:opacity-50">
          <Icon name="sparkle" size={14} />{busy ? "Pensando…" : "Más ideas (IA)"}
        </button>
      </div>

      {list.length === 0 && !ai && <p className="rounded-2xl bg-white/[0.04] px-4 py-3 text-[14px] text-mute">Todo en orden. Si algo se desvía, aquí te lo digo con la propuesta para corregirlo.</p>}

      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5">
            <div className="flex items-center gap-2 text-[11px] font-semibold">
              <span className={`rounded-full px-2 py-0.5 ${TONE[p.facet].soft} ${TONE[p.facet].text}`}>{p.agent}</span>
              {p.priority === 0 && <span className="rounded-full bg-amber/15 px-2 py-0.5 text-amber">Urgente</span>}
            </div>
            <p className="text-[15px] font-semibold leading-snug">{p.title}</p>
            <p className="text-[13px] leading-snug text-mute">{p.why}</p>
            <div className="mt-auto flex flex-wrap gap-2 pt-1">
              {p.action.kind === "link" ? (
                <Link href={p.action.href} onClick={() => actions.dismiss(p.id, today)} className={`${btn.primary} min-h-9 px-3 text-[13px]`}>{p.cta}</Link>
              ) : (
                <button type="button" onClick={() => applyProposal(p, hq, today)} className={`${btn.primary} min-h-9 px-3 text-[13px]`}>{p.cta}</button>
              )}
              <button type="button" onClick={() => actions.dismiss(p.id, today)} className="min-h-9 rounded-full px-3 text-[13px] font-semibold text-mute hover:text-fg">Ahora no</button>
            </div>
          </li>
        ))}
      </ul>
      {list.length > 3 && <button type="button" onClick={() => setAll(!all)} className="self-start text-[13px] font-semibold text-iris">{all ? "Ver menos" : `Ver las ${list.length} propuestas`}</button>}

      {err && <p role="status" className="text-[13px] text-amber">{err}</p>}
      {ai && (
        <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-iris">Ideas de Sombra (IA)</p>
          <ul className="grid gap-2 md:grid-cols-2">
            {ai.map((idea, i) => (
              <li key={i} className="flex flex-col gap-1.5 rounded-2xl bg-iris/[0.07] p-3.5">
                <p className="text-[15px] font-semibold leading-snug">{idea.title}</p>
                <p className="text-[13px] leading-snug text-mute">{idea.why}</p>
                {idea.habit && (
                  <button type="button" className="mt-1 self-start rounded-full bg-white/[0.08] px-3 py-1.5 text-[13px] font-semibold"
                    onClick={() => { actions.addHabit({ title: idea.habit!.title, emoji: idea.habit!.emoji || "✅", time: idea.habit!.time, anchor: idea.habit!.anchor, days: [0, 1, 2, 3, 4, 5, 6], kind: "hacer", facet: idea.facet }, today); setAi(ai.filter((_, j) => j !== i)); }}>
                    + Agregar como hábito{idea.habit.time ? ` (${idea.habit.time})` : ""}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ideasContext(hq: HqState, today: string, list: I.Proposal[]) {
  return {
    today,
    calorieTarget: hq.profile.calorieTarget,
    stake: hq.profile.stake,
    habits: hq.habits.map((h) => ({ title: h.title, time: h.time, streak: H.habitStreak(hq, h, today), weekRate: H.weekRate(hq, h, today) })),
    projects: hq.work.projects.filter((p) => !p.done).map((p) => ({ name: p.name, due: p.due })),
    focusGoal: hq.work.focusGoal,
    weeklyClips: hq.brand.weeklyClips,
    monthlyGoal: hq.money.monthlyGoal,
    alreadyProposed: list.map((p) => p.title),
  };
}

// --- Rutina de hoy (hábitos con recordatorio) ---------------------------------------------
export function HabitsToday({ hq, today, hhmm }: { hq: HqState; today: string; hhmm: string }) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const list = H.today(hq, today, hhmm);
  const done = list.filter((x) => x.done).length;

  return (
    <section aria-labelledby="habits-h" className="glass flex flex-col gap-4 rounded-[26px] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="habits-h" className="text-[17px] font-semibold tracking-tight">Rutina de hoy</h2>
          <p className="text-[12px] text-mute">{list.length ? `${done} de ${list.length} hechos · te aviso a la hora de cada uno` : "Hábitos con recordatorio, anclados a algo que ya haces"}</p>
        </div>
        <div className="flex gap-2">
          {hq.habits.length > 0 && <button type="button" className={btn.chip} onClick={() => setEditing(!editing)}>{editing ? "Listo" : "Editar"}</button>}
          <button type="button" className={btn.ghost} onClick={() => setAdding(true)}>+ Hábito</button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {H.PRESETS.slice(0, 6).map((p) => (
            <button key={p.title} type="button" onClick={() => actions.addHabit(p, today)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white/[0.06] px-3.5 text-[14px] hover:bg-white/[0.1]">
              <span aria-hidden="true">{p.emoji}</span>{p.title}{p.time && <span className="text-mute">{p.time}</span>}
            </button>
          ))}
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {list.map(({ habit: h, done: d, streak, late }) => (
            <li key={h.id} className="flex flex-col items-center gap-1.5 text-center">
              <button type="button" onClick={() => actions.toggleHabit(today, h.id)} aria-pressed={d} aria-label={`${h.title}${d ? ", hecho" : ""}`}
                className={`relative rounded-full transition-transform active:scale-95 ${late ? "ring-2 ring-amber/60 ring-offset-2 ring-offset-transparent" : ""}`}>
                <ActivityRing pct={d ? 100 : 0} size={68} stroke={6} color={TONE[h.facet].ring} track="stroke-white/[0.08]" label={h.title}>
                  <span aria-hidden="true" className={`text-[26px] ${d ? "" : "opacity-70 grayscale-[40%]"}`}>{h.emoji}</span>
                </ActivityRing>
                {d && <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-ink"><Icon name="check" size={12} strokeWidth={3} /></span>}
              </button>
              <span className="line-clamp-2 text-[12px] font-semibold leading-tight">{h.title}</span>
              <span className={`text-[11px] ${late ? "font-semibold text-amber" : "text-mute"}`}>{h.kind === "evitar" ? "Evitar" : h.time ?? "Sin hora"}{streak > 1 ? ` · 🔥${streak}` : ""}</span>
              {editing && (
                <span className="flex items-center gap-1">
                  <input aria-label={`Hora de ${h.title}`} type="time" value={h.time ?? ""} onChange={(e) => actions.updateHabit(h.id, { time: e.target.value || null })} className="w-[5.5rem] rounded-lg bg-white/[0.06] px-1.5 py-1 text-[12px]" />
                  <button type="button" aria-label={`Borrar ${h.title}`} onClick={() => actions.removeHabit(h.id)} className="text-mute hover:text-danger"><Icon name="x" size={15} /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {list.length > 0 && <p className="text-[12px] text-mute">{list.filter((x) => x.habit.anchor).slice(0, 2).map((x) => `${H.stackLine(x.habit)} → ${x.habit.title.toLowerCase()}`).join(" · ")}</p>}
      {adding && <HabitSheet today={today} onClose={() => setAdding(false)} existing={hq.habits.map((h) => h.title)} />}
    </section>
  );
}

function HabitSheet({ today, onClose, existing }: { today: string; onClose: () => void; existing: string[] }) {
  const [f, setF] = useState<H.HabitPreset>({ title: "", emoji: "✅", time: "09:00", days: [0, 1, 2, 3, 4, 5, 6], anchor: "", kind: "hacer", facet: "cuerpo" });
  const save = () => {
    if (!f.title.trim()) return;
    actions.addHabit({ ...f, title: f.title.trim(), time: f.kind === "evitar" ? null : f.time }, today);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-labelledby="hsheet-h">
      <button type="button" aria-label="Cerrar" className="wso-fade absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="glass glass-strong wso-sheet relative flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:rounded-[28px]">
        <h2 id="hsheet-h" className="text-[19px] font-semibold tracking-tight">Nuevo hábito</h2>
        <div className="flex flex-wrap gap-1.5">
          {H.PRESETS.filter((p) => !existing.includes(p.title)).map((p) => (
            <button key={p.title} type="button" onClick={() => setF(p)} className={`rounded-full px-3 py-1.5 text-[13px] ${f.title === p.title ? "bg-accent text-ink" : "bg-white/[0.06]"}`}>{p.emoji} {p.title}</button>
          ))}
        </div>
        <div className="grid grid-cols-[4rem_1fr] gap-2">
          <input aria-label="Emoji" maxLength={4} className={`${input} text-center text-xl`} value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} />
          <input aria-label="Hábito" placeholder="Ej. Creatina" maxLength={50} className={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </div>
        <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 rounded-[10px] bg-white/[0.06] p-0.5">
          {(["hacer", "evitar"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => setF({ ...f, kind: k })} className={`min-h-9 rounded-[8px] text-[13px] font-semibold ${f.kind === k ? "bg-white/[0.12]" : "text-mute"}`}>{k === "hacer" ? "Hacer" : "Evitar"}</button>
          ))}
        </div>
        {f.kind === "hacer" && (
          <label className="flex items-center justify-between gap-3 text-[14px]">Recordatorio
            <input type="time" value={f.time ?? ""} onChange={(e) => setF({ ...f, time: e.target.value || null })} className={`${input} w-36`} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-[14px]">Después de… <span className="text-[12px] text-mute">(ancla: algo que ya haces diario)</span>
          <input placeholder="el desayuno, el café, entrenar…" maxLength={60} className={input} value={f.anchor} onChange={(e) => setF({ ...f, anchor: e.target.value })} />
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-[14px]">Días</legend>
          <div className="flex gap-1.5">
            {H.DAY_LETTERS.map((l, i) => {
              const on = f.days.includes(i);
              return <button key={i} type="button" aria-pressed={on} aria-label={["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][i]} onClick={() => setF({ ...f, days: on ? (f.days.length > 1 ? f.days.filter((d) => d !== i) : f.days) : [...f.days, i].sort() })} className={`h-9 w-9 rounded-full text-[13px] font-semibold ${on ? "bg-accent text-ink" : "bg-white/[0.06] text-mute"}`}>{l}</button>;
            })}
          </div>
        </fieldset>
        <label className="flex items-center justify-between gap-3 text-[14px]">Faceta
          <select value={f.facet} onChange={(e) => setF({ ...f, facet: e.target.value as H.HabitPreset["facet"] })} className={`${input} w-40`}>
            {(["cuerpo", "mente", "trabajo", "marca", "dinero"] as const).map((x) => <option key={x} value={x}>{x[0]!.toUpperCase() + x.slice(1)}</option>)}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className={btn.chip} onClick={onClose}>Cancelar</button>
          <button type="submit" className={btn.primary} disabled={!f.title.trim()}>Guardar hábito</button>
        </div>
      </form>
    </div>
  );
}
