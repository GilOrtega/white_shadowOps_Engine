import { isDue, isDone } from "./habits";
import * as L from "./logic";
import type { HqState } from "./schemas";

/**
 * Flamas: cada día tienes una lista (misiones del reto + hábitos que tocan + pendientes tuyos).
 * Cumplir ≥ 80 % = flama; 100 % = flama completa. 7 flamas en una semana del reto = semana perfecta.
 * Las semanas perfectas SEGUIDAS hacen evolucionar a Sombra.
 */
export const FLAME_AT = 0.8;

export type ChecklistItem = {
  id: string;
  title: string;
  detail?: string;
  group: "reto" | "habitos" | "tuyo";
  done: boolean;
  /** Se marca solo (comidas, calorías): no tiene casilla. */
  auto: boolean;
  /** Obligatoria para el reto de "me rapo". */
  required: boolean;
  /** Extra: si la haces suma, si no, no te baja el porcentaje. */
  bonus?: boolean;
  emoji?: string;
};

export function dayChecklist(s: HqState, date: string) {
  const items: ChecklistItem[] = [];
  for (const m of L.missionsFor(s, date)) {
    items.push({ id: `m:${m.id}`, title: m.title, detail: m.detail, group: "reto", done: m.done, auto: m.auto, required: m.required, bonus: !m.required });
  }
  for (const h of s.habits) {
    if (!isDue(h, date)) continue;
    items.push({ id: `h:${h.id}`, title: h.kind === "evitar" ? `Sin ${h.title.replace(/^sin\s+/i, "")}` : h.title, group: "habitos", done: isDone(s, h, date), auto: false, required: false, emoji: h.emoji });
  }
  for (const t of L.dayOf(s, date).todos ?? []) {
    items.push({ id: `t:${t.id}`, title: t.title, group: "tuyo", done: t.done, auto: false, required: false });
  }
  const counted = items.filter((i) => !i.bonus || i.done);
  const total = counted.length;
  const done = counted.filter((i) => i.done).length;
  const pct = total ? done / total : 0;
  return { items, total, done, pct, missing: Math.max(0, Math.ceil(total * FLAME_AT - 1e-9) - done) };
}

export type Flame = "none" | "flama" | "completa";

/** La flama de un día. Solo cuentan días que ya registraste (entraste a la app ese día). */
export function flameOf(s: HqState, date: string): Flame {
  if (!(date in s.days)) return "none";
  const c = dayChecklist(s, date);
  if (!c.total) return "none";
  if (c.done === c.total) return "completa";
  return c.pct >= FLAME_AT ? "flama" : "none";
}

/** Semanas del reto (bloques de 7 días desde el día 1). */
export function challengeWeeks(s: HqState, today: string) {
  const start = s.profile.startDate;
  const elapsed = Math.max(0, L.diffDays(start, today));
  const count = Math.floor(elapsed / 7) + 1;
  return Array.from({ length: count }, (_, w) => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = L.addDays(start, w * 7 + i);
      return { date, flame: date > today ? ("none" as Flame) : flameOf(s, date), future: date > today, today: date === today };
    });
    const flames = days.filter((d) => d.flame !== "none").length;
    const closed = days[6]!.date < today || (days[6]!.date === today && flames === 7);
    return { index: w + 1, days, flames, perfect: flames === 7, closed };
  });
}

/** Semanas perfectas seguidas que traes (la semana en curso no rompe la racha hasta que cierra). */
export function weekStreak(s: HqState, today: string) {
  const weeks = challengeWeeks(s, today);
  let n = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i]!;
    if (!w.closed) continue; // la semana en curso todavía se puede salvar
    if (!w.perfect) break;
    n++;
  }
  const best = weeks.reduce((acc, w) => {
    if (!w.closed) return acc;
    acc.run = w.perfect ? acc.run + 1 : 0;
    acc.best = Math.max(acc.best, acc.run);
    return acc;
  }, { run: 0, best: 0 }).best;
  const current = weeks.at(-1)!;
  return { streak: n, best, current: current.closed ? null : current, total: weeks.filter((w) => w.closed && w.perfect).length };
}

export type FormId = "base" | "chispa" | "tormenta" | "furia" | "bestia";
export const FORMS: { id: FormId; at: number; name: string; what: string }[] = [
  { id: "base", at: 0, name: "Sombra", what: "Un fantasma con ganas. Cumple una semana perfecta y se prende." },
  { id: "chispa", at: 1, name: "Sombra en llamas", what: "Le salen flamitas: ya agarró el ritmo." },
  { id: "tormenta", at: 4, name: "Sombra Tormenta", what: "Flamas y rayos: 4 semanas seguidas sin fallar." },
  { id: "furia", at: 8, name: "Sombra Furia", what: "Aura azul y truenos por todos lados." },
  { id: "bestia", at: 16, name: "Sombra Bestia", what: "16 semanas: el fantasma más mamado del barrio." },
];

export function formFor(streakWeeks: number) {
  let i = 0;
  FORMS.forEach((f, n) => { if (streakWeeks >= f.at) i = n; });
  const form = FORMS[i]!;
  const next = FORMS[i + 1] ?? null;
  return { form, next, toNext: next ? next.at - streakWeeks : 0, pct: next ? (streakWeeks - form.at) / (next.at - form.at) : 1 };
}

/** Todo lo que necesita la pantalla: forma actual, carga de la semana y lo que falta. */
export function evolution(s: HqState, today: string) {
  const w = weekStreak(s, today);
  const f = formFor(w.streak);
  const charge = w.current ? w.current.flames / 7 : 1;
  return { ...w, ...f, charge };
}
