import * as L from "./logic";
import type { Habit, HqState } from "./schemas";

/**
 * Hábitos con recordatorio (lo mejor de Streaks + Fabulous): anillo por hábito, racha propia,
 * hora del aviso y "ancla" (habit stacking: "después de…"). Puro, se prueba en scripts/habits.selftest.ts.
 */
export type HabitPreset = Omit<Habit, "id" | "createdAt">;

/** Plantillas para arrancar en un toque. Nada de dosis médicas: el usuario ajusta lo suyo. */
export const PRESETS: HabitPreset[] = [
  { title: "Creatina", emoji: "💊", time: "09:00", days: [0, 1, 2, 3, 4, 5, 6], anchor: "el desayuno", kind: "hacer", facet: "cuerpo" },
  { title: "Agua: 3 litros", emoji: "💧", time: "12:00", days: [0, 1, 2, 3, 4, 5, 6], anchor: "", kind: "hacer", facet: "cuerpo" },
  { title: "Proteína en el desayuno", emoji: "🍳", time: "08:30", days: [0, 1, 2, 3, 4, 5, 6], anchor: "despertar", kind: "hacer", facet: "cuerpo" },
  { title: "Pesarme", emoji: "⚖️", time: "07:30", days: [0, 1, 2, 3, 4, 5, 6], anchor: "ir al baño", kind: "hacer", facet: "cuerpo" },
  { title: "Dormir antes de las 11", emoji: "🌙", time: "22:30", days: [0, 1, 2, 3, 4, 5, 6], anchor: "", kind: "hacer", facet: "mente" },
  { title: "Sin refresco", emoji: "🚫", time: null, days: [0, 1, 2, 3, 4, 5, 6], anchor: "", kind: "evitar", facet: "cuerpo" },
  { title: "Bloque de enfoque sin celular", emoji: "🎯", time: "10:00", days: [0, 1, 2, 3, 4], anchor: "el café", kind: "hacer", facet: "trabajo" },
  { title: "Grabar un clip", emoji: "🎬", time: "19:00", days: [0, 2, 4], anchor: "entrenar", kind: "hacer", facet: "marca" },
];

export const DAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

export const isDue = (h: Habit, date: string) => date >= h.createdAt && h.days.includes(L.weekdayIndex(date));
export const isDone = (s: HqState, h: Habit, date: string) => L.dayOf(s, date).habitsDone.includes(h.id);

/** Días seguidos cumplidos (solo cuenta los días que tocaba). Hoy sin marcar no rompe la racha. */
export function habitStreak(s: HqState, h: Habit, today: string): number {
  let n = 0;
  for (let d = today, guard = 0; guard < 400; d = L.addDays(d, -1), guard++) {
    if (d < h.createdAt) break;
    if (!isDue(h, d)) continue;
    if (isDone(s, h, d)) n++;
    else if (d !== today) break;
  }
  return n;
}

/** De los últimos 7 días que tocaba, cuántos cumpliste (0–1). */
export function weekRate(s: HqState, h: Habit, today: string): number | null {
  let due = 0, done = 0;
  for (let i = 1; i <= 7; i++) {
    const d = L.addDays(today, -i);
    if (!isDue(h, d)) continue;
    due++;
    if (isDone(s, h, d)) done++;
  }
  return due >= 3 ? done / due : null; // con menos de 3 días no se juzga
}

export interface HabitToday { habit: Habit; done: boolean; streak: number; late: boolean }

/** Los de hoy, en orden de hora. `late` = ya pasó su hora y no está marcado. */
export function today(s: HqState, date: string, hhmm: string): HabitToday[] {
  return s.habits
    .filter((h) => isDue(h, date))
    .map((habit) => {
      const done = isDone(s, habit, date);
      return { habit, done, streak: habitStreak(s, habit, date), late: !done && habit.time !== null && habit.time <= hhmm && habit.kind === "hacer" };
    })
    .sort((a, b) => (a.habit.time ?? "99") .localeCompare(b.habit.time ?? "99"));
}

/** Frase de habit stacking: "Después de el desayuno: creatina". */
export const stackLine = (h: Habit) => (h.anchor ? `Después de ${h.anchor}` : h.kind === "evitar" ? "Todo el día" : h.time ? `A las ${h.time}` : "Cuando puedas");
