import * as L from "./logic";
import type { HqState } from "./schemas";

/**
 * Centro de mando por facetas de tu vida. Cada faceta responde lo mismo:
 * ¿cómo voy hoy (anillo), cuál es el número que importa y qué hago ahora?
 * Puro: sin React, se prueba en scripts/facets.selftest.ts.
 */
export type FacetId = "cuerpo" | "mente" | "trabajo" | "marca" | "dinero";
export type FacetStatus = "cumplido" | "ok" | "atento" | "peligro" | "sin-datos";

export type FacetAction =
  | { kind: "train" }
  | { kind: "feeling" }
  | { kind: "focus" }
  | { kind: "link"; href: string };

export interface Facet {
  id: FacetId;
  name: string;
  agent: string;
  /** 0–100 (puede pasarse de 100 si superas la meta). */
  pct: number;
  metric: string;
  sub: string;
  /** Frase para el titular del centro de mando cuando esta faceta es la más urgente. */
  headline: string;
  status: FacetStatus;
  next: { label: string; action: FacetAction } | null;
}

export interface FacetContext {
  /** Capturas de la Bitácora hoy y racha (null = aún carga). */
  journal: { todayCount: number; streak: number } | null;
  /** Clips aprobados en el Estudio esta semana. */
  approvedClipsThisWeek: number;
}

export const FEELING_LABEL = { con_todo: "Con todo", normal: "Normal", fundido: "Fundido" } as const;

const money = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`;
export const weekStart = (date: string) => L.addDays(date, -L.weekdayIndex(date));
export const monthKey = (date: string) => date.slice(0, 7);
const daysInMonth = (date: string) => new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0).getDate();

export function monthIncome(s: HqState, today: string) {
  const key = monthKey(today);
  return s.money.entries.filter((e) => e.date.startsWith(key)).reduce((n, e) => n + e.amount, 0);
}

/** Clips de la semana: días marcados "clip" + clips aprobados en el Estudio. */
export function clipsThisWeek(s: HqState, today: string, approved: number) {
  const start = weekStart(today);
  let marked = 0;
  for (let d = start; d <= today; d = L.addDays(d, 1)) if (L.dayOf(s, d).clipDone) marked++;
  return marked + approved;
}

export function nextDeadline(s: HqState, today: string) {
  return s.work.projects
    .filter((p) => !p.done && p.due)
    .map((p) => ({ ...p, inDays: L.diffDays(today, p.due!) }))
    .sort((a, b) => a.inDays - b.inDays)[0] ?? null;
}

export function facets(s: HqState, today: string, hour: number, ctx: FacetContext): Facet[] {
  const day = L.dayOf(s, today);

  // Cuerpo: el reto (misiones obligatorias y el medidor de peligro).
  const req = L.missionsFor(s, today).filter((m) => m.required);
  const doneReq = req.filter((m) => m.done).length;
  const danger = L.dangerInfo(s, today, hour);
  const firstLeft = req.find((m) => !m.done);
  const cuerpo: Facet = {
    id: "cuerpo", name: "Cuerpo", agent: "Coach + Nutri",
    pct: (doneReq / Math.max(req.length, 1)) * 100,
    metric: `${doneReq}/${req.length} misiones`,
    sub: danger.level === "cumplido" ? "Día asegurado" : `${danger.title} · ${L.challengeInfo(s.profile, today).daysLeft} días al veredicto`,
    headline: danger.level === "cumplido" ? "Cuerpo asegurado hoy." : danger.detail,
    status: danger.level,
    next: !firstLeft ? null : firstLeft.id === "train" ? { label: "Ya entrené", action: { kind: "train" } } : { label: "Registrar comida", action: { kind: "link", href: "#comidas" } },
  };

  // Mente: cómo vienes hoy + la captura de la Bitácora.
  const felt = day.feeling !== null;
  const captured = (ctx.journal?.todayCount ?? 0) > 0;
  const mente: Facet = {
    id: "mente", name: "Mente", agent: "Sombra",
    pct: (felt ? 50 : 0) + (captured ? 50 : 0),
    metric: felt ? FEELING_LABEL[day.feeling!] : "¿Cómo vienes?",
    sub: ctx.journal ? `Bitácora: ${ctx.journal.streak} día${ctx.journal.streak === 1 ? "" : "s"} seguidos` : "Bitácora",
    headline: !felt ? "Antes que nada: ¿cómo vienes hoy?" : "Falta la captura del día en tu Bitácora.",
    status: felt && captured ? "cumplido" : day.feeling === "fundido" ? "atento" : felt || captured ? "ok" : hour >= 20 ? "atento" : "ok",
    next: !felt ? { label: "¿Cómo vienes hoy?", action: { kind: "feeling" } } : !captured ? { label: "Captura del día", action: { kind: "link", href: "/bitacora" } } : null,
  };

  // Trabajo: bloques de enfoque contra la meta diaria + la entrega más cercana.
  const goal = s.work.focusGoal;
  const due = nextDeadline(s, today);
  const active = s.work.projects.filter((p) => !p.done).length;
  const trabajo: Facet = {
    id: "trabajo", name: "Trabajo", agent: "Estratega",
    pct: (day.focusBlocks / goal) * 100,
    metric: `${day.focusBlocks}/${goal} bloques de enfoque`,
    sub: due ? `${due.name}: ${due.inDays < 0 ? `vencida hace ${-due.inDays} d` : due.inDays === 0 ? "se entrega hoy" : `entrega en ${due.inDays} d`}` : active ? `${active} proyecto${active === 1 ? "" : "s"} activo${active === 1 ? "" : "s"}` : "Sin proyectos activos",
    headline: due && due.inDays <= 1 && !due.done ? `${due.name} se entrega ${due.inDays <= 0 ? "hoy" : "mañana"}: bloque de enfoque ya.` : `Te ${goal - day.focusBlocks === 1 ? "falta 1 bloque" : `faltan ${goal - day.focusBlocks} bloques`} de enfoque hoy.`,
    status: day.focusBlocks >= goal ? "cumplido" : (due && due.inDays <= 1) || (hour >= 18 && day.focusBlocks === 0) ? "atento" : "ok",
    next: day.focusBlocks >= goal ? null : { label: "+1 bloque (50 min)", action: { kind: "focus" } },
  };

  // Marca: clips de la semana contra la meta.
  const clips = clipsThisWeek(s, today, ctx.approvedClipsThisWeek);
  const wk = s.brand.weeklyClips;
  const weekDay = L.weekdayIndex(today) + 1;
  const marca: Facet = {
    id: "marca", name: "Marca", agent: "Miner + Copywriter",
    pct: (clips / wk) * 100,
    metric: `${clips}/${wk} clips esta semana`,
    sub: clips >= wk ? "Meta de la semana cumplida" : `${wk - clips} por sacar · quedan ${7 - weekDay + 1} días`,
    headline: `Te ${wk - clips === 1 ? "falta 1 clip" : `faltan ${wk - clips} clips`} esta semana.`,
    status: clips >= wk ? "cumplido" : clips / wk < weekDay / 7 - 0.3 ? "atento" : "ok",
    next: clips >= wk ? null : { label: "Abrir estudio", action: { kind: "link", href: "/crew" } },
  };

  // Dinero: ingresos del mes contra la meta y contra el ritmo esperado a esta fecha.
  const income = monthIncome(s, today);
  const mGoal = s.money.monthlyGoal;
  const pace = Number(today.slice(8, 10)) / daysInMonth(today);
  const dinero: Facet = mGoal === null
    ? { id: "dinero", name: "Dinero", agent: "Estratega", pct: 0, metric: income ? `${money(income)} este mes` : "Sin meta", sub: "Ponle meta al mes para medir el ritmo", headline: "Ponle meta de ingresos al mes.", status: "sin-datos", next: { label: "Poner meta", action: { kind: "link", href: "#dinero" } } }
    : {
        id: "dinero", name: "Dinero", agent: "Estratega",
        pct: (income / mGoal) * 100,
        metric: `${money(income)} de ${money(mGoal)}`,
        sub: income >= mGoal ? "Meta del mes cumplida" : income / mGoal >= pace ? "Vas arriba del ritmo del mes" : `Para ir al ritmo: ${money(mGoal * pace - income)} más`,
        headline: income / mGoal >= pace ? "Dinero va arriba del ritmo del mes." : `Para ir al ritmo del mes te faltan ${money(mGoal * pace - income)}.`,
        status: income >= mGoal ? "cumplido" : income / mGoal >= pace * 0.8 ? "ok" : pace > 0.5 ? "peligro" : "atento",
        next: { label: "Registrar ingreso", action: { kind: "link", href: "#dinero" } },
      };

  return [cuerpo, mente, trabajo, marca, dinero];
}

/** Calificación del día: promedio de facetas con datos (cada una topada en 100). */
export function lifeScore(list: Facet[]): number {
  const scored = list.filter((f) => f.status !== "sin-datos");
  if (!scored.length) return 0;
  return Math.round(scored.reduce((n, f) => n + Math.min(f.pct, 100), 0) / scored.length);
}

/** La faceta que más urge (para el titular del centro de mando). */
export function mostUrgent(list: Facet[]): Facet | null {
  const rank: Record<FacetStatus, number> = { peligro: 0, atento: 1, ok: 2, "sin-datos": 3, cumplido: 4 };
  return [...list].filter((f) => f.next).sort((a, b) => rank[a.status] - rank[b.status] || a.pct - b.pct)[0] ?? null;
}
