"use client";

import Link from "next/link";
import { useState } from "react";
import { useJobs } from "@/crew/repo";
import type { StreamJob } from "@/crew/schemas";
import * as F from "@/hq/facets";
import { proposals } from "@/hq/insights";
import { pulse, type Capture } from "@/hq/journal";
import { useCaptures } from "@/hq/journal-store";
import * as L from "@/hq/logic";
import type { HqState } from "@/hq/schemas";
import { actions, parseNumber } from "@/hq/store";
import { btn, Card, H2, Icon, input } from "./ui";
import { Proposals } from "./Proactive";
import { BeforeNow, ConsistencyMap, FacetArt, MiniBars, PaceLine, PhotoStrip, ScoreTrend } from "./Visuals";
import { ActivityRing, StreakAvatar } from "./Widgets";

/** Colores por faceta (anillo, texto, fondo suave). */
export const TONE: Record<F.FacetId, { ring: string; text: string; soft: string; dot: string; icon: string }> = {
  cuerpo: { ring: "stroke-accent", text: "text-accent", soft: "bg-accent/12", dot: "bg-accent", icon: "shield" },
  mente: { ring: "stroke-iris", text: "text-iris", soft: "bg-iris/12", dot: "bg-iris", icon: "sparkle" },
  trabajo: { ring: "stroke-sky", text: "text-sky", soft: "bg-sky/12", dot: "bg-sky", icon: "target" },
  marca: { ring: "stroke-amber", text: "text-amber", soft: "bg-amber/12", dot: "bg-amber", icon: "video" },
  dinero: { ring: "stroke-mint", text: "text-mint", soft: "bg-mint/12", dot: "bg-mint", icon: "chart" },
};

const STATUS: Record<F.FacetStatus, { label: string; cls: string }> = {
  cumplido: { label: "Cumplido", cls: "bg-accent/15 text-accent" },
  ok: { label: "En tiempo", cls: "bg-white/[0.07] text-fg/80" },
  atento: { label: "Atento", cls: "bg-amber/15 text-amber" },
  peligro: { label: "Peligro", cls: "bg-danger/15 text-danger" },
  "sin-datos": { label: "Sin meta", cls: "bg-white/[0.06] text-mute" },
};

/** Clips aprobados en el Estudio cuyo trabajo es de esta semana. */
export function approvedThisWeek(jobs: StreamJob[] | null, today: string) {
  const start = F.weekStart(today);
  return (jobs ?? []).filter((j) => j.createdAt.slice(0, 10) >= start).reduce((n, j) => n + j.clips.filter((c) => c.decision === "aprobado").length, 0);
}

export type MandoPart = "all" | "mando" | "propone" | "historia";

export function CommandCenter({ hq, today, hour, dateLabel, part = "all" }: { hq: HqState; today: string; hour: number; dateLabel: string; part?: MandoPart }) {
  const captures = useCaptures();
  const jobs = useJobs();
  const p = captures ? pulse(captures, today) : null;
  return <CommandCenterView hq={hq} today={today} hour={hour} dateLabel={dateLabel} captures={captures} part={part} ctx={{ journal: p, approvedClipsThisWeek: approvedThisWeek(jobs, today) }} />;
}

export function CommandCenterView({ hq, today, hour, dateLabel, ctx, captures = null, part = "all" }: { hq: HqState; today: string; hour: number; dateLabel: string; ctx: F.FacetContext; captures?: Capture[] | null; part?: MandoPart }) {
  const show = (p: MandoPart) => part === "all" || part === p;
  const list = F.facets(hq, today, hour, ctx);
  const hist = F.history(hq, today, 14, new Set((captures ?? []).map((c) => c.date)));
  const week = hist.slice(-7);
  const pace = hq.money.monthlyGoal ? F.monthPace(hq, today) : null;
  const props = proposals(hq, today, hour, ctx);
  const score = F.lifeScore(list);
  const urgent = F.mostUrgent(list);
  const headline = score >= 100 ? "Día redondo. Todas las facetas en verde." : urgent ? urgent.headline : "Vas bien. Sostén el ritmo.";

  return (
    <div className="flex flex-col gap-4">
      {show("mando") && <>
      <section aria-labelledby="mando-h" className="glass relative grid gap-6 overflow-hidden rounded-[26px] p-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:p-7">
        <LifeRings list={list} score={score} />
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-mute">{dateLabel} · Centro de mando</p>
              {urgent && score < 100 && <p className={`mt-2 text-[12px] font-semibold uppercase tracking-wide ${TONE[urgent.id].text}`}>Lo que sigue · {urgent.name}</p>}
              <h1 id="mando-h" className="font-display text-[26px] font-bold leading-[1.12] tracking-[-0.03em] md:text-[30px]">{headline}</h1>
            </div>
            <Link href="/ajustes" aria-label="Tu perfil y ajustes" className="shrink-0"><StreakAvatar hq={hq} today={today} size={48} /></Link>
          </div>
          <ul className="flex flex-wrap gap-2">
            {list.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1.5 text-[13px]">
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${TONE[f.id].dot}`} />
                <span>{f.name}</span>
                <span className="tnum font-semibold">{f.status === "sin-datos" ? "—" : `${Math.round(Math.min(f.pct, 999))}%`}</span>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-mute">Apuesta del reto: {hq.profile.stake}</p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {list.map((f, i) => (
          <div key={f.id} className={`flex lg:col-span-2 ${i >= 3 ? "lg:col-span-3" : ""}`}>
            <FacetCard f={f} today={today} chart={f.id === "dinero" && pace
              ? <PaceLine data={pace} label={`Ingreso acumulado del mes contra el ritmo`} />
              : <div className="w-full max-w-[300px]"><MiniBars id={f.id} points={week.map((d) => ({ date: d.date, v: d.scores[f.id] }))} label={`${f.name}: últimos 7 días`} /></div>} />
          </div>
        ))}
      </div>
      </>}

      {show("propone") && <Proposals hq={hq} today={today} list={props} />}

      {show("historia") && <>

      <section aria-labelledby="semana-h" className="glass grid gap-5 rounded-[26px] p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="semana-h" className="text-[17px] font-semibold tracking-tight">Tus últimas 2 semanas</h2>
            <span className="text-[12px] text-mute">calificación del día (0–100)</span>
          </div>
          <ScoreTrend days={hist} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="text-[17px] font-semibold tracking-tight">Constancia por faceta</h3>
          <ConsistencyMap days={hist} />
        </div>
      </section>

      <section aria-labelledby="fotos-h" className="glass flex flex-col gap-3 rounded-[26px] p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="fotos-h" className="text-[17px] font-semibold tracking-tight">Tu historia en fotos</h2>
          <Link href="/bitacora" className="text-[13px] font-semibold text-iris">Abrir Bitácora →</Link>
        </div>
        <div className={`grid gap-4 ${captures?.some((c) => c.kind === "fisico") ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
          <PhotoStrip captures={captures ?? []} />
          <BeforeNow captures={captures ?? []} />
        </div>
      </section>
      </>}
    </div>
  );
}

/** Anillos concéntricos (uno por faceta) con la calificación del día al centro. */
function LifeRings({ list, score }: { list: F.Facet[]; score: number }) {
  const size = 188;
  const stroke = 11;
  const gap = 3.5;
  return (
    <div role="img" aria-label={`Calificación de hoy: ${score} de 100`} className="relative mx-auto shrink-0" style={{ width: size, height: size }}>
      {list.map((f, i) => {
        const s = size - i * 2 * (stroke + gap);
        return (
          <div key={f.id} className="absolute" style={{ inset: i * (stroke + gap) }}>
            <ActivityRing pct={f.status === "sin-datos" ? 0 : f.pct} size={s} stroke={stroke} color={TONE[f.id].ring} track="stroke-white/[0.07]" label={`${f.name}: ${Math.round(f.pct)}%`} />
          </div>
        );
      })}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum font-display text-[30px] font-bold leading-none tracking-[-0.04em]">{score}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-mute">hoy</span>
      </div>
    </div>
  );
}

function FacetCard({ f, today, chart }: { f: F.Facet; today: string; chart: React.ReactNode }) {
  const t = TONE[f.id];
  const st = STATUS[f.status];
  return (
    <article aria-labelledby={`facet-${f.id}`} className="glass relative isolate flex w-full min-w-0 flex-col gap-3 overflow-hidden rounded-[22px] p-4">
      <FacetArt id={f.id} className="pointer-events-none absolute -bottom-6 -right-6 -z-10 h-36 w-36 opacity-[0.16]" />
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${t.soft} ${t.text}`}><Icon name={t.icon} size={16} /></span>
          <span className="min-w-0">
            <span id={`facet-${f.id}`} className="block text-[15px] font-semibold leading-tight">{f.name}</span>
            <span className="block truncate text-[11px] text-mute">{f.agent}</span>
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
      </div>
      <div className="flex items-center gap-3">
        <ActivityRing pct={f.status === "sin-datos" ? 0 : f.pct} size={52} stroke={6} color={t.ring} track="stroke-white/[0.07]" label={`${f.name}: ${Math.round(f.pct)}%`} />
        <div className="min-w-0">
          <p className="tnum truncate text-[16px] font-semibold leading-tight">{f.metric}</p>
          <p className="line-clamp-2 text-[12px] leading-snug text-mute">{f.sub}</p>
        </div>
      </div>
      {chart}
      <div className="mt-auto">
        {f.next?.action.kind === "feeling" ? (
          <div role="group" aria-label="¿Cómo vienes hoy?" className="grid grid-cols-3 gap-1.5">
            {(Object.keys(F.FEELING_LABEL) as (keyof typeof F.FEELING_LABEL)[]).map((k) => (
              <button key={k} type="button" onClick={() => actions.setFeeling(today, k)} className="min-h-9 rounded-xl bg-white/[0.06] px-1 text-[12px] font-semibold hover:bg-white/[0.1]">{F.FEELING_LABEL[k]}</button>
            ))}
          </div>
        ) : f.next ? (
          <FacetButton f={f} today={today} />
        ) : (
          <p className={`flex min-h-9 items-center gap-1.5 text-[13px] font-semibold ${t.text}`}><Icon name="check" size={15} strokeWidth={2.6} />Listo por hoy</p>
        )}
      </div>
    </article>
  );
}

function FacetButton({ f, today }: { f: F.Facet; today: string }) {
  const a = f.next!.action;
  const cls = `inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold ${TONE[f.id].soft} ${TONE[f.id].text} hover:brightness-125`;
  if (a.kind === "link") return <Link href={a.href} className={cls}>{f.next!.label}<Icon name="arrow" size={14} /></Link>;
  const run = () => (a.kind === "train" ? actions.setTraining(today, true) : a.kind === "focus" ? actions.addFocusBlock(today, 1) : undefined);
  return <button type="button" onClick={run} className={cls}>{f.next!.label}</button>;
}

// --- Trabajo, dinero y metas --------------------------------------------------------------
export function WorkMoney({ hq, today }: { hq: HqState; today: string }) {
  const [proj, setProj] = useState({ name: "", client: "", due: "" });
  const [inc, setInc] = useState({ amount: "", note: "" });
  const [goal, setGoal] = useState(hq.money.monthlyGoal === null ? "" : String(hq.money.monthlyGoal));
  const month = F.monthKey(today);
  const entries = hq.money.entries.filter((e) => e.date.startsWith(month)).slice().reverse();
  const total = F.monthIncome(hq, today);
  const projects = [...hq.work.projects].sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const fmt = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card id="trabajo" aria-labelledby="work-h" className="flex scroll-mt-6 flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <H2 id="work-h">Trabajo</H2>
          <Stepper label="Bloques al día" value={hq.work.focusGoal} min={1} max={8} onChange={(focusGoal) => actions.setWork({ focusGoal })} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-4 py-3">
          <span className="text-[14px]">Hoy: <b className="tnum">{L.dayOf(hq, today).focusBlocks}</b> de {hq.work.focusGoal} bloques de enfoque</span>
          <span className="flex gap-1.5">
            <button type="button" aria-label="Quitar un bloque" className={btn.chip} onClick={() => actions.addFocusBlock(today, -1)}>−</button>
            <button type="button" aria-label="Sumar un bloque" className={btn.chip} onClick={() => actions.addFocusBlock(today, 1)}>+1</button>
          </span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {projects.length === 0 && <li className="text-sm text-mute">Agrega tus proyectos de clientes (Inforcom) con su fecha de entrega.</li>}
          {projects.map((p) => {
            const d = p.due ? L.diffDays(today, p.due) : null;
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white/[0.03]">
                <input type="checkbox" checked={p.done} onChange={() => actions.toggleProject(p.id)} aria-label={`Entregado: ${p.name}`} className="h-5 w-5 accent-[var(--sky)]" />
                <span className={`min-w-0 flex-1 ${p.done ? "text-mute line-through" : ""}`}>
                  <span className="block truncate text-[14px] font-medium">{p.name}</span>
                  {p.client && <span className="block truncate text-[12px] text-mute">{p.client}</span>}
                </span>
                {d !== null && !p.done && <span className={`shrink-0 text-[12px] font-semibold ${d <= 1 ? "text-amber" : "text-mute"}`}>{d < 0 ? `vencida ${-d} d` : d === 0 ? "hoy" : `${d} d`}</span>}
                <button type="button" aria-label={`Borrar ${p.name}`} className="shrink-0 text-mute hover:text-danger" onClick={() => actions.removeProject(p.id)}><Icon name="x" size={16} /></button>
              </li>
            );
          })}
        </ul>
        <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!proj.name.trim()) return; actions.addProject({ name: proj.name.trim(), client: proj.client.trim(), due: proj.due || null }); setProj({ name: "", client: "", due: "" }); }}>
          <input aria-label="Proyecto" placeholder="Proyecto" maxLength={60} className={input} value={proj.name} onChange={(e) => setProj({ ...proj, name: e.target.value })} />
          <input aria-label="Cliente" placeholder="Cliente" maxLength={60} className={input} value={proj.client} onChange={(e) => setProj({ ...proj, client: e.target.value })} />
          <input aria-label="Fecha de entrega" type="date" className={input} value={proj.due} onChange={(e) => setProj({ ...proj, due: e.target.value })} />
          <button type="submit" className={btn.ghost}>Agregar</button>
        </form>
      </Card>

      <div className="flex flex-col gap-4">
        <Card id="dinero" aria-labelledby="money-h" className="flex scroll-mt-6 flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <H2 id="money-h">Dinero</H2>
            <span className="tnum text-[14px] text-mute">{fmt(total)}{hq.money.monthlyGoal ? ` de ${fmt(hq.money.monthlyGoal)}` : ""} este mes</span>
          </div>
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); const n = parseNumber(goal); actions.setMoneyGoal(n !== null && n > 0 ? n : null); }}>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-mute">Meta del mes (MXN)
              <input inputMode="decimal" className={input} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ej. 40000" />
            </label>
            <button type="submit" className={btn.ghost}>Guardar</button>
          </form>
          <form className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)_auto]" onSubmit={(e) => { e.preventDefault(); const n = parseNumber(inc.amount); if (n === null || n <= 0) return; actions.addIncome({ date: today, amount: n, note: inc.note.trim() }); setInc({ amount: "", note: "" }); }}>
            <input aria-label="Monto" inputMode="decimal" placeholder="$ monto" className={input} value={inc.amount} onChange={(e) => setInc({ ...inc, amount: e.target.value })} />
            <input aria-label="Concepto" placeholder="Concepto (cliente, anticipo…)" maxLength={60} className={input} value={inc.note} onChange={(e) => setInc({ ...inc, note: e.target.value })} />
            <button type="submit" className={btn.primary}>Registrar</button>
          </form>
          {entries.length > 0 && (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-1 text-[14px]">
                  <span className="tnum w-14 shrink-0 text-[12px] text-mute">{e.date.slice(8)}/{e.date.slice(5, 7)}</span>
                  <span className="min-w-0 flex-1 truncate">{e.note || "Ingreso"}</span>
                  <span className="tnum font-semibold text-mint">{fmt(e.amount)}</span>
                  <button type="button" aria-label="Borrar ingreso" className="text-mute hover:text-danger" onClick={() => actions.removeIncome(e.id)}><Icon name="x" size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-mute">Se guarda solo en este navegador (y en tu respaldo de Ajustes).</p>
        </Card>
        <Card aria-labelledby="brand-h" className="flex items-center justify-between gap-3">
          <div>
            <H2 id="brand-h">Marca</H2>
            <p className="text-sm text-mute">Meta de clips por semana (TikTok / Reels / Shorts).</p>
          </div>
          <Stepper label="Clips por semana" value={hq.brand.weeklyClips} min={1} max={21} onChange={(n) => actions.setWeeklyClips(n)} />
        </Card>
      </div>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div role="group" aria-label={label} className="flex items-center rounded-full bg-white/[0.06] p-1">
      <button type="button" aria-label={`${label}: menos`} disabled={value <= min} onClick={() => onChange(value - 1)} className="flex h-8 w-8 items-center justify-center rounded-full text-lg disabled:opacity-30">−</button>
      <span className="tnum w-8 text-center text-[14px] font-semibold" aria-live="polite">{value}</span>
      <button type="button" aria-label={`${label}: más`} disabled={value >= max} onClick={() => onChange(value + 1)} className="flex h-8 w-8 items-center justify-center rounded-full text-lg disabled:opacity-30">+</button>
    </div>
  );
}
