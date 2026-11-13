"use client";

import { useState } from "react";
import * as F from "@/hq/flames";
import * as L from "@/hq/logic";
import { gymBanner } from "@/hq/motivation";
import type { HqState } from "@/hq/schemas";
import { actions } from "@/hq/store";
import { MascotFace } from "./Mascot";
import { Check, Icon } from "./ui";

/** Flama chiquita para calendario, contadores y botones. */
export function FlameIcon({ size = 16, kind = "flama", dim = false }: { size?: number; kind?: F.Flame; dim?: boolean }) {
  const outer = dim ? "#4a4f5c" : kind === "completa" ? "#ffb020" : "#ff7a1a";
  const inner = dim ? "#6b7180" : kind === "completa" ? "#fff2a8" : "#ffd36b";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2c1 3.4 5.6 5.4 5.6 11a5.6 5.6 0 0 1-11.2 0c0-2.4 1.1-4.2 2.6-5.4-.1 1.8.6 3.1 1.9 3.6C11.3 8.4 10.2 5.2 12 2z" fill={outer} />
      <path d="M12 11.5c.6 1.6 2.6 2.4 2.6 4.6a2.6 2.6 0 0 1-5.2 0c0-1.3.8-2.1 1.5-2.6.1.9.5 1.3 1 1.4-.2-1.3-.4-2.3.1-3.4z" fill={inner} />
    </svg>
  );
}

const WEEK_LABEL = ["L", "M", "M", "J", "V", "S", "D"];

/** Arriba de todo: tu Sombra (con su forma), las 7 flamas de la semana y cuánto llevas hoy. */
export function TodayHeader({ hq, today, dateLabel }: { hq: HqState; today: string; dateLabel: string }) {
  const ev = F.evolution(hq, today);
  const c = F.dayChecklist(hq, today);
  const info = L.challengeInfo(hq.profile, today);
  const pct = Math.round(c.pct * 100);
  const flame = pct >= 80;
  const week = ev.current?.days ?? F.challengeWeeks(hq, today).at(-1)!.days;
  const mood: L.Mood = flame ? "fiesta" : pct >= 50 ? "fuego" : "listo";
  return (
    <section aria-labelledby="hoy-h" className="glass relative overflow-hidden rounded-[28px] p-5 md:p-6">
      <div aria-hidden="true" className={`pointer-events-none absolute -top-24 -left-16 h-64 w-64 rounded-full blur-3xl ${ev.form.id === "furia" ? "bg-sky/20" : ev.form.id === "bestia" ? "bg-iris/25" : ev.form.id === "base" ? "bg-lime/10" : "bg-amber/20"}`} />
      <div className="relative flex items-center gap-4 md:gap-6">
        <a href="#evolucion" aria-label={`Tu Sombra: ${ev.form.name}. Ver evolución`} className="shrink-0">
          <MascotFace mood={mood} size={104} form={ev.form.id} charge={ev.charge} />
        </a>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-[13px] font-medium text-mute">{dateLabel} · Día {info.dayNumber} de {hq.profile.challengeDays}</p>
          <h1 id="hoy-h" className="font-display text-[24px] font-bold leading-[1.1] tracking-[-0.03em] md:text-[30px]">
            {c.done === c.total && c.total > 0 ? "Día completo. Así se hace." : flame ? "Flama asegurada 🔥" : `Te ${c.missing === 1 ? "falta 1" : `faltan ${c.missing}`} para la flama`}
          </h1>
          <ol aria-label="Flamas de esta semana" className="flex gap-1.5">
            {week.map((d) => (
              <li key={d.date} aria-label={`${L.WEEKDAYS[L.weekdayIndex(d.date)]}: ${d.future ? "pendiente" : d.flame === "none" ? (d.today ? "hoy, sin flama todavía" : "sin flama") : "flama"}`}
                className={`flex h-9 w-9 flex-col items-center justify-center rounded-xl text-[10px] font-semibold ${d.today ? "ring-2 ring-lime/70" : ""} ${d.flame !== "none" ? "bg-amber/15" : "bg-white/[0.05]"}`}>
                {d.flame !== "none" ? <FlameIcon size={18} kind={d.flame} /> : <span className={d.future ? "text-mute/50" : "text-mute"}>{WEEK_LABEL[L.weekdayIndex(d.date)]}</span>}
              </li>
            ))}
          </ol>
          <p className="text-[13px] text-mute">
            <span className="font-semibold text-fg">{ev.form.name}</span>
            {ev.next ? ` · ${ev.toNext} ${ev.toNext === 1 ? "semana perfecta" : "semanas perfectas"} para ${ev.next.name}` : " · forma máxima"}
          </p>
        </div>
      </div>
    </section>
  );
}

const GROUP_LABEL: Record<F.ChecklistItem["group"], string> = { reto: "El reto", habitos: "Hábitos", tuyo: "Tus pendientes" };

/** La lista del día: misiones del reto + hábitos + lo que tú agregues. ≥ 80 % = flama. */
export function DayChecklist({ hq, today }: { hq: HqState; today: string }) {
  const c = F.dayChecklist(hq, today);
  const [text, setText] = useState("");
  const [daily, setDaily] = useState(false);
  const pct = Math.round(c.pct * 100);
  const flame = c.pct >= F.FLAME_AT;
  const groups = (["reto", "habitos", "tuyo"] as const).map((g) => ({ g, items: c.items.filter((i) => i.group === g) })).filter((x) => x.items.length || x.g === "tuyo");

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (daily) actions.addHabit({ title: t.slice(0, 50), emoji: "✅", time: null, days: [0, 1, 2, 3, 4, 5, 6], anchor: "", kind: "hacer", facet: "mente" }, today);
    else actions.addTodo(today, t);
    setText("");
  };

  return (
    <section id="lista" aria-labelledby="lista-h" className="glass relative flex scroll-mt-6 flex-col gap-4 rounded-[26px] p-5">
      <span id="misiones" aria-hidden="true" className="absolute -top-6" />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="lista-h" className="font-display text-[20px] font-bold tracking-[-0.02em]">Tu lista de hoy</h2>
          <p className="text-[13px] text-mute">{c.done} de {c.total} · cumple el 80 % y te llevas la flama</p>
        </div>
        <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[15px] font-bold tnum ${flame ? "bg-amber/15 text-amber" : "bg-white/[0.06] text-fg"}`}>
          <FlameIcon size={18} kind={c.done === c.total && c.total ? "completa" : "flama"} dim={!flame} />{pct}%
        </span>
      </div>

      <div className="relative" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Avance de la lista de hoy">
        <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
          <div className={`h-full rounded-full transition-[width] duration-500 ${flame ? "bg-gradient-to-r from-amber to-[#ff7a1a]" : "bg-lime"}`} style={{ width: `${pct}%` }} />
        </div>
        <span aria-hidden="true" className="absolute top-[-3px] h-4 w-0.5 rounded bg-fg/60" style={{ left: "80%" }} />
      </div>

      {groups.map(({ g, items }) => (
        <div key={g} className="flex flex-col gap-1.5">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-mute/80">{GROUP_LABEL[g]}</p>
          <ul className="flex flex-col gap-1.5">
            {items.map((it) => <Row key={it.id} it={it} today={today} />)}
          </ul>
        </div>
      ))}

      <form onSubmit={add} className="flex flex-col gap-2 rounded-2xl border border-dashed border-white/12 p-2.5">
        <div className="flex gap-2">
          <input aria-label="Agregar a tu lista" value={text} maxLength={80} onChange={(e) => setText(e.target.value)} placeholder="Agregar algo a tu lista…"
            className="min-h-11 min-w-0 flex-1 rounded-xl bg-white/[0.05] px-3 text-[15px] outline-none placeholder:text-mute/70 focus:ring-1 focus:ring-lime/50" />
          <button type="submit" disabled={!text.trim()} className="flex min-h-11 items-center gap-1 rounded-xl bg-lime px-4 text-[14px] font-semibold text-ink disabled:opacity-40">
            <Icon name="plus" size={16} strokeWidth={2.6} />Agregar
          </button>
        </div>
        <div role="radiogroup" aria-label="Cada cuándo" className="flex gap-1.5">
          {[{ v: false, l: "Solo hoy" }, { v: true, l: "Todos los días" }].map((o) => (
            <button key={o.l} type="button" role="radio" aria-checked={daily === o.v} onClick={() => setDaily(o.v)}
              className={`min-h-9 rounded-full px-3 text-[13px] ${daily === o.v ? "bg-white/[0.12] font-semibold text-fg" : "text-mute hover:text-fg"}`}>{o.l}</button>
          ))}
        </div>
      </form>
    </section>
  );
}

function Row({ it, today }: { it: F.ChecklistItem; today: string }) {
  const content = (
    <>
      <Check done={it.done} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`text-[15px] leading-snug ${it.done ? "text-mute line-through decoration-white/30" : "font-medium"}`}>
          {it.emoji && <span aria-hidden="true" className="mr-1.5">{it.emoji}</span>}{it.title}
        </span>
        {it.detail && <span className="text-[12px] text-mute">{it.detail}</span>}
      </span>
      {it.required && <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mute">Reto</span>}
      {it.bonus && <span className="shrink-0 rounded-full bg-iris/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-iris">Extra</span>}
    </>
  );
  const base = "flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left";
  return (
    <li className="flex items-center gap-1">
      {it.auto ? (
        <a href="#comidas" className={`${base} bg-white/[0.03] hover:bg-white/[0.06]`} aria-label={`${it.title}: ${it.done ? "cumplido" : "pendiente"} (se marca solo con tus comidas)`}>{content}</a>
      ) : (
        <button type="button" aria-pressed={it.done} onClick={() => actions.toggleChecklist(today, it.id)} className={`${base} transition-colors ${it.done ? "bg-lime/[0.06]" : "bg-white/[0.03] hover:bg-white/[0.06]"}`}>{content}</button>
      )}
      {it.group === "tuyo" && (
        <button type="button" aria-label={`Quitar ${it.title}`} onClick={() => actions.removeTodo(today, it.id.slice(2))} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-mute hover:bg-white/[0.06] hover:text-fg">
          <Icon name="x" size={16} />
        </button>
      )}
    </li>
  );
}

/** Escalera de evolución + calendario de flamas del reto. */
export function SombraEvolution({ hq, today }: { hq: HqState; today: string }) {
  const ev = F.evolution(hq, today);
  return (
    <section aria-labelledby="evo-h" className="glass flex flex-col gap-5 rounded-[26px] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="evo-h" className="font-display text-[19px] font-bold tracking-[-0.02em]">La evolución de tu Sombra</h2>
        <span className="text-[13px] text-mute">{ev.streak === 1 ? "1 semana perfecta seguida" : `${ev.streak} semanas perfectas seguidas`} · récord {ev.best}</span>
      </div>
      <ol className="grid grid-cols-5 gap-2">
        {F.FORMS.map((f) => {
          const unlocked = ev.streak >= f.at;
          const current = f.id === ev.form.id;
          return (
            <li key={f.id} className={`flex flex-col items-center gap-1 rounded-2xl p-2 text-center ${current ? "bg-white/[0.08] ring-1 ring-lime/50" : ""}`}>
              <span className={unlocked ? "" : "opacity-30 grayscale"}><MascotFace mood={unlocked && f.id !== "base" ? "fuego" : "listo"} size={58} form={f.id} /></span>
              <span className={`text-[11px] font-semibold leading-tight ${unlocked ? "" : "text-mute"}`}>{f.name.replace("Sombra ", "")}</span>
              <span className="text-[10px] text-mute">{f.at === 0 ? "Inicio" : `${f.at} sem.`}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-[14px] text-fg/85">{ev.next ? <>Siguiente: <b>{ev.next.name}</b>. {ev.next.what}</> : ev.form.what}</p>
      <p className="text-[12px] text-mute">Una semana perfecta = 7 días con flama (80 % de tu lista o más). Si una semana se cae, la racha vuelve a empezar, pero tu récord se queda.</p>
      <FlameCalendar hq={hq} today={today} />
    </section>
  );
}

/** Calendario del reto: una fila por semana, flama en cada día que la ganaste. */
export function FlameCalendar({ hq, today }: { hq: HqState; today: string }) {
  const start = hq.profile.startDate;
  const total = hq.profile.challengeDays;
  const rows = Math.ceil(total / 7);
  const startIdx = L.weekdayIndex(start);
  const heads = Array.from({ length: 7 }, (_, i) => WEEK_LABEL[(startIdx + i) % 7]!);
  const flames = Array.from({ length: total }, (_, i) => L.addDays(start, i)).filter((d) => d <= today && F.flameOf(hq, d) !== "none").length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[15px] font-semibold">Calendario de flamas</h3>
        <span className="flex items-center gap-1 text-[13px] text-mute"><FlameIcon size={14} />{flames} de {Math.min(total, L.diffDays(start, today) + 1)} días</span>
      </div>
      <div role="grid" aria-label="Calendario del reto" className="flex flex-col gap-1.5">
        <div role="row" className="grid grid-cols-[2.2rem_repeat(7,minmax(0,1fr))_1.6rem] gap-1.5 text-center text-[10px] font-semibold text-mute/70">
          <span />{heads.map((d, i) => <span key={i} role="columnheader">{d}</span>)}<span />
        </div>
        {Array.from({ length: rows }, (_, w) => {
          const days = Array.from({ length: 7 }, (_, i) => w * 7 + i).filter((n) => n < total).map((n) => L.addDays(start, n));
          const perfect = days.length === 7 && days.every((d) => d <= today && F.flameOf(hq, d) !== "none");
          return (
            <div key={w} role="row" className="grid grid-cols-[2.2rem_repeat(7,minmax(0,1fr))_1.6rem] items-center gap-1.5">
              <span className="text-[10px] font-semibold text-mute">S{w + 1}</span>
              {days.map((d, i) => {
                const fl = d <= today ? F.flameOf(hq, d) : "none";
                const future = d > today;
                const isToday = d === today;
                const missed = !future && !isToday && fl === "none";
                return (
                  <span key={d} role="gridcell" aria-label={`Día ${w * 7 + i + 1} (${d}): ${future ? "pendiente" : fl !== "none" ? "flama" : isToday ? "hoy" : "sin flama"}`}
                    className={`flex aspect-square items-center justify-center rounded-lg text-[10px] tnum ${fl !== "none" ? "bg-amber/15" : future ? "bg-white/[0.03] text-mute/40" : missed ? "bg-white/[0.04] text-mute/60" : "bg-white/[0.06]"} ${isToday ? "ring-2 ring-lime/70" : ""}`}>
                    {fl !== "none" ? <FlameIcon size={16} kind={fl} /> : missed ? "·" : w * 7 + i + 1}
                  </span>
                );
              })}
              {Array.from({ length: 7 - days.length }, (_, i) => <span key={`pad${i}`} />)}
              <span className="flex justify-center" aria-label={perfect ? "Semana perfecta" : undefined}>{perfect && <FlameIcon size={18} kind="completa" />}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Banner pegajoso del gym: te empuja o te regaña según cómo vas. */
export function GymBanner({ hq, today, hour }: { hq: HqState; today: string; hour: number }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const b = gymBanner(hq, today, hour);
  const scold = b.tone === "regaño";
  return (
    <div role="status" className={`wso-in sticky top-2 z-10 flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-xl ${scold ? "border-danger/40 bg-[#2a1214]/90" : "border-amber/40 bg-[#2a1c0c]/90"}`}>
      <span aria-hidden="true" className="mt-0.5 text-[22px]">{scold ? "😤" : "🔥"}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`font-display text-[16px] font-bold leading-snug ${scold ? "text-[#ff8a8a]" : "text-amber"}`}>{b.text}</span>
        <span className="text-[12px] text-fg/75">{b.sub}</span>
      </span>
      <button type="button" aria-label="Ocultar frase" onClick={() => setHidden(true)} className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-mute hover:text-fg"><Icon name="x" size={15} /></button>
    </div>
  );
}
