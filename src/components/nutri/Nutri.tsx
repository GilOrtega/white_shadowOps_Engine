"use client";

import Link from "next/link";
import { useState } from "react";
import { callAgent } from "@/hq/client";
import { weekStart } from "@/hq/facets";
import * as L from "@/hq/logic";
import * as N from "@/hq/nutrition";
import type { HqState } from "@/hq/schemas";
import { actions, useHq } from "@/hq/store";
import { useToday } from "@/hq/useToday";
import { btn, Icon, input, Loading, PageTitle } from "../hq/ui";

export function NutriPage() {
  const hq = useHq();
  const today = useToday();
  if (!hq || !today) return <Loading />;
  return <NutriView hq={hq} today={today} hour={new Date().getHours()} />;
}

const fmt = (n: number) => Math.round(n).toLocaleString("es-MX");

export function NutriView({ hq, today, hour }: { hq: HqState; today: string; hour: number }) {
  const t = N.targetsFor(hq);
  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Nutriólogo" sub="Tus calorías, tus macros y qué comer, con comida mexicana de verdad" />
      <TodayCard hq={hq} today={today} hour={hour} t={t} />
      <WeekMenu hq={hq} today={today} />
      <NumbersCard hq={hq} t={t} />
      <AskCard hq={hq} today={today} t={t} />
      <p className="text-[12px] leading-snug text-mute">Orientación general con valores aproximados. No sustituye a un nutriólogo con cédula: si tienes una enfermedad, tomas medicamentos o tu relación con la comida se siente difícil, consúltalo con un profesional.</p>
    </div>
  );
}

function Meter({ label, value, goal, unit, tone }: { label: string; value: number; goal: number; unit: string; tone: string }) {
  const pct = Math.min(100, (value / Math.max(1, goal)) * 100);
  const over = value > goal * 1.05;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-mute">{label}</span>
        <span className="tnum"><b className={over ? "text-amber" : "text-fg"}>{fmt(value)}</b><span className="text-mute"> / {fmt(goal)} {unit}</span></span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]"><div className={`h-full rounded-full ${over ? "bg-amber" : tone}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function TodayCard({ hq, today, hour, t }: { hq: HqState; today: string; hour: number; t: N.Targets }) {
  const d = L.dayOf(hq, today);
  const next = N.nextMeal(hq, today, hour);
  const slot = N.SLOTS.find((s) => s.id === next.slot)!;
  return (
    <section aria-labelledby="nutri-hoy" className="glass flex flex-col gap-4 rounded-[26px] p-5">
      <h2 id="nutri-hoy" className="font-display text-[20px] font-bold tracking-[-0.02em]">Hoy</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Meter label="Calorías" value={L.kcalOf(d)} goal={t.kcal} unit="kcal" tone="bg-lime" />
        <Meter label="Proteína" value={L.proteinOf(d)} goal={t.proteinG} unit="g" tone="bg-sky" />
      </div>
      <div className="flex flex-col gap-2 rounded-2xl bg-black/25 p-4">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-mute">Tu siguiente comida · {slot.label}</p>
        <p className="text-[14px] text-fg/85">{next.text}</p>
        {next.dish && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[16px] font-semibold">{next.dish.name}</p>
              <p className="text-[13px] text-mute">{next.dish.portion} · {fmt(next.dish.kcal)} kcal · {next.dish.p} g proteína</p>
            </div>
            <button type="button" className={btn.ghost} onClick={() => actions.addMeal(today, { name: next.dish!.name.slice(0, 80), kcal: next.dish!.kcal, proteinG: next.dish!.p, source: "manual" })}>
              <Icon name="check" size={16} />Me lo comí
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function WeekMenu({ hq, today }: { hq: HqState; today: string }) {
  const week = weekStart(today);
  const menu = N.weekMenu(hq, week);
  const todayIdx = L.weekdayIndex(today);
  const [day, setDay] = useState(todayIdx);
  const [changing, setChanging] = useState<N.Slot | null>(null);
  const [showList, setShowList] = useState(false);
  const d = menu[day]!;
  const t = N.targetsFor(hq);
  return (
    <section aria-labelledby="nutri-menu" className="glass flex flex-col gap-4 rounded-[26px] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="nutri-menu" className="font-display text-[20px] font-bold tracking-[-0.02em]">Tu menú de la semana</h2>
        <span className="text-[13px] text-mute">Meta {fmt(t.kcal)} kcal · {t.proteinG} g proteína</span>
      </div>
      <div role="tablist" aria-label="Día" className="grid grid-cols-7 gap-1">
        {DAY_LABELS.map((l, k) => (
          <button key={l} type="button" role="tab" aria-selected={day === k} onClick={() => { setDay(k); setChanging(null); }}
            className={`min-h-11 rounded-xl text-[13px] font-semibold ${day === k ? "bg-lime text-ink" : k === todayIdx ? "bg-white/[0.08] text-fg ring-1 ring-lime/40" : "bg-white/[0.04] text-mute hover:text-fg"}`}>{l}</button>
        ))}
      </div>
      <ol className="flex flex-col gap-2">
        {d.meals.map((m) => {
          const s = N.SLOTS.find((x) => x.id === m.slot)!;
          const key = N.swapKey(week, day, m.slot);
          return (
            <li key={m.slot} className="flex flex-col gap-2 rounded-2xl bg-white/[0.03] p-3">
              <div className="flex items-start gap-3">
                <span className="w-16 shrink-0 pt-0.5 text-[12px] font-semibold text-mute">{s.label}<br /><span className="font-normal">{s.time}</span></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-snug">{m.dish.name}</p>
                  <p className="text-[12px] leading-snug text-mute">{N.portionLabel(m.x) && <b className="text-amber">{N.portionLabel(m.x)} · </b>}{m.dish.portion}</p>
                  <p className="mt-0.5 text-[12px] tnum text-fg/75">{fmt(m.dish.kcal * m.x)} kcal · {Math.round(m.dish.p * m.x)} g P · {Math.round(m.dish.c * m.x)} g C · {Math.round(m.dish.f * m.x)} g G</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 pl-[4.75rem]">
                {day === todayIdx && (
                  <button type="button" className={btn.chip} onClick={() => actions.addMeal(today, { name: `${m.dish.name}${m.x !== 1 ? ` (${N.portionLabel(m.x).toLowerCase()})` : ""}`.slice(0, 80), kcal: Math.round(m.dish.kcal * m.x), proteinG: Math.round(m.dish.p * m.x), source: "manual" })}>Me lo comí</button>
                )}
                <button type="button" className={btn.chip} aria-expanded={changing === m.slot} onClick={() => setChanging(changing === m.slot ? null : m.slot)}>Cambiar</button>
                {m.swapped && <button type="button" className={btn.chip} onClick={() => actions.swapDish(key, null)}>Volver al sugerido</button>}
                <button type="button" className={btn.chip} onClick={() => actions.toggleSkipDish(m.dish.id)}>No me gusta</button>
              </div>
              {changing === m.slot && (
                <ul className="flex flex-col gap-1 pl-[4.75rem]">
                  {N.alternatives(m.dish, hq.nutrition.skip).map((a) => (
                    <li key={a.id}>
                      <button type="button" onClick={() => { actions.swapDish(key, a.id); setChanging(null); }} className="flex w-full items-center justify-between gap-2 rounded-xl bg-black/25 px-3 py-2 text-left text-[13px] hover:bg-white/[0.06]">
                        <span className="min-w-0 truncate">{a.name}</span><span className="shrink-0 tnum text-mute">{a.kcal} kcal · {a.p} g P</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-[13px] text-mute">Total del {DAY_LABELS[day]}: <b className="text-fg tnum">{fmt(d.kcal)} kcal</b> · <b className="text-fg tnum">{d.p} g</b> de proteína</p>
      {hq.nutrition.skip.length > 0 && (
        <p className="text-[12px] text-mute">No te sugiero: {hq.nutrition.skip.map((id) => N.dishById(id)?.name).filter(Boolean).join(", ")}. <button type="button" className="font-semibold text-iris" onClick={() => hq.nutrition.skip.forEach((id) => actions.toggleSkipDish(id))}>Volver a incluir todo</button></p>
      )}
      <button type="button" className={btn.ghost} aria-expanded={showList} onClick={() => setShowList(!showList)}><Icon name="check" size={16} />{showList ? "Ocultar lista del súper" : "Lista del súper de la semana"}</button>
      {showList && <Grocery menu={menu} />}
    </section>
  );
}

function Grocery({ menu }: { menu: N.DayMenu[] }) {
  const list = N.groceryList(menu);
  const [got, setGot] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const text = list.map((g) => `• ${g.item}: ${N.fmtQty(g)}`).join("\n");
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-black/25 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-mute">{list.length} productos · cantidades aproximadas para 7 días</p>
        <button type="button" className={btn.chip} onClick={async () => { try { await navigator.clipboard.writeText(`Súper de la semana\n${text}`); setCopied(true); } catch { setCopied(false); } }}>
          <Icon name="copy" size={14} />{copied ? "Copiada" : "Copiar"}
        </button>
      </div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {list.map((g) => {
          const k = `${g.item}|${g.unit}`;
          const on = got.includes(k);
          return (
            <li key={k}>
              <button type="button" aria-pressed={on} onClick={() => setGot(on ? got.filter((x) => x !== k) : [...got, k])}
                className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-[14px] ${on ? "text-mute line-through" : ""}`}>
                <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? "border-lime bg-lime text-ink" : "border-white/25"}`}>{on && <Icon name="check" size={12} strokeWidth={3} />}</span>
                <span className="min-w-0 flex-1 truncate">{g.item}</span><span className="shrink-0 tnum text-mute">{N.fmtQty(g)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NumbersCard({ hq, t }: { hq: HqState; t: N.Targets }) {
  const n = hq.nutrition;
  const act = N.activityFor(hq);
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return (
    <section aria-labelledby="nutri-num" className="glass flex flex-col gap-4 rounded-[26px] p-5">
      <div>
        <h2 id="nutri-num" className="font-display text-[20px] font-bold tracking-[-0.02em]">Tus números</h2>
        <p className="text-[13px] text-mute">Con tu estatura, edad y sexo calculo tu gasto (fórmula Mifflin-St Jeor) y tu meta según tu objetivo. Peso actual: {N.currentWeight(hq).toFixed(1)} kg.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-[12px] text-mute">Estatura (cm)
          <input className={input} inputMode="numeric" defaultValue={n.heightCm ?? ""} placeholder="175" onBlur={(e) => { const v = num(e.target.value); if (v === null || (v >= 120 && v <= 230)) actions.setNutrition({ heightCm: v === null ? null : Math.round(v) }); }} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-mute">Edad
          <input className={input} inputMode="numeric" defaultValue={n.age ?? ""} placeholder="30" onBlur={(e) => { const v = num(e.target.value); if (v === null || (v >= 18 && v <= 90)) actions.setNutrition({ age: v === null ? null : Math.round(v) }); }} />
        </label>
        <div className="flex flex-col gap-1 text-[12px] text-mute">Sexo
          <div role="radiogroup" aria-label="Sexo" className="grid grid-cols-2 gap-1">
            {([["h", "Hombre"], ["m", "Mujer"]] as const).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={n.sex === v} onClick={() => actions.setNutrition({ sex: v })}
                className={`min-h-11 rounded-xl text-[13px] font-semibold ${n.sex === v ? "bg-white/[0.14] text-fg" : "bg-white/[0.04] text-mute"}`}>{l}</button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-[12px] text-mute">Actividad
          <select className={input} value={n.activity ?? ""} onChange={(e) => actions.setNutrition({ activity: (e.target.value || null) as N.Activity | null })}>
            <option value="">Automática ({N.ACTIVITY[act].label.toLowerCase()})</option>
            {(Object.keys(N.ACTIVITY) as N.Activity[]).map((a) => <option key={a} value={a}>{N.ACTIVITY[a].label}: {N.ACTIVITY[a].what}</option>)}
          </select>
        </label>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Mantenimiento", t.maintenance ? `${fmt(t.maintenance)} kcal` : "—"],
          ["Tu meta", `${fmt(t.kcal)} kcal`],
          ["Proteína", `${t.proteinG} g`],
          ["Carbohidratos", `${t.carbsG} g`],
          ["Grasa", `${t.fatG} g`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-black/25 p-3"><dt className="text-[11px] font-semibold uppercase tracking-wide text-mute">{k}</dt><dd className="mt-0.5 font-display text-[19px] font-bold tnum">{v}</dd></div>
        ))}
      </dl>
      <p className="text-[13px] text-fg/80">{t.note}</p>
      {t.basis === "formula" && t.kcal !== hq.profile.calorieTarget && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-lime/10 p-3">
          <p className="min-w-0 flex-1 text-[14px]">Tu meta actual en la app es {fmt(hq.profile.calorieTarget)} kcal. ¿La cambio a {fmt(t.kcal)}?</p>
          <button type="button" className={btn.primary} onClick={() => actions.updateProfile({ calorieTarget: t.kcal })}>Usar {fmt(t.kcal)} kcal</button>
        </div>
      )}
    </section>
  );
}

type Answer = { answer: string; tips: string[]; seeProfessional: boolean };

function AskCard({ hq, today, t }: { hq: HqState; today: string; t: N.Targets }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [a, setA] = useState<Answer | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function ask() {
    if (q.trim().length < 3) return;
    setBusy(true);
    setErr(null);
    const d = L.dayOf(hq, today);
    const lastDays = Array.from({ length: 7 }, (_, k) => L.addDays(today, -(k + 1))).filter((x) => x in hq.days).map((x) => ({ date: x, kcal: L.kcalOf(hq.days[x]!), proteinG: L.proteinOf(hq.days[x]!) }));
    const res = await callAgent<Answer>("/api/agents/nutri", {
      question: q.trim(),
      context: { goal: hq.plan?.goal ?? "bajar", weightKg: Math.round(N.currentWeight(hq) * 10) / 10, targets: { kcal: t.kcal, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG }, today: d.meals.slice(-12).map((m) => ({ name: m.name, kcal: m.kcal, proteinG: m.proteinG })), lastDays },
    }, hq.accessKey);
    if (res.ok) setA(res.data);
    else setErr(res.message);
    setBusy(false);
  }
  return (
    <section aria-labelledby="nutri-ask" className="glass flex flex-col gap-3 rounded-[26px] p-5">
      <h2 id="nutri-ask" className="font-display text-[20px] font-bold tracking-[-0.02em]">Pregúntale al nutriólogo</h2>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <label className="sr-only" htmlFor="nutri-q">Tu pregunta</label>
        <input id="nutri-q" className={`${input} min-h-11 flex-1`} value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} placeholder="Ej. ¿Qué ceno si voy a una carne asada el sábado?" />
        <button type="submit" className={btn.ai} disabled={busy || q.trim().length < 3}><Icon name="sparkle" size={16} />{busy ? "Pensando…" : "Preguntar"}</button>
      </form>
      {err && <p role="status" className="text-[13px] text-amber">{err}</p>}
      {a && (
        <div className="flex flex-col gap-2 rounded-2xl bg-black/25 p-4 text-[14px] leading-relaxed">
          <p>{a.answer}</p>
          {a.tips.length > 0 && <ul className="list-disc pl-5 text-fg/85">{a.tips.map((x) => <li key={x}>{x}</li>)}</ul>}
          {a.seeProfessional && <p className="rounded-xl bg-amber/10 p-2.5 text-[13px] text-amber">Esto conviene verlo con un nutriólogo con cédula o tu médico.</p>}
        </div>
      )}
    </section>
  );
}

/** Versión corta para la sección Comidas de Hoy. */
export function NutriTip({ hq, today, hour }: { hq: HqState; today: string; hour: number }) {
  const next = N.nextMeal(hq, today, hour);
  const slot = N.SLOTS.find((s) => s.id === next.slot)!;
  return (
    <Link href="/nutri" className="glass flex items-center gap-3 rounded-2xl px-4 py-3 hover:bg-white/[0.06]">
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint/15 text-mint"><Icon name="leaf" size={20} /></span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-mute">Tu nutriólogo · {slot.label}</span>
        <span className="truncate text-[14px] font-semibold">{next.dish?.name ?? "Revisa tu menú"}</span>
        <span className="truncate text-[12px] text-mute">{next.text}</span>
      </span>
      <Icon name="arrow" size={16} />
    </Link>
  );
}
