/**
 * Bitácora visual: capturas del día (inicio, métricas, tableros, avance, físico).
 * Las reglas de abajo son puras. El guardado vive en journal-store.ts (IndexedDB),
 * porque las imágenes no caben en localStorage.
 */
import { z } from "zod";
import { addDays, diffDays, parseDate } from "./logic";

export const KINDS = [
  { id: "inicio", label: "Inicio del día", hint: "La pantalla con la que arrancas" },
  { id: "metricas", label: "Métricas", hint: "Números que quieres ver mover" },
  { id: "tablero", label: "Tablero", hint: "Tu tablero de tareas o proyecto" },
  { id: "avance", label: "Avance", hint: "Algo que terminaste o mejoraste" },
  { id: "fisico", label: "Físico", hint: "Foto de tu cambio físico" },
] as const;
export type CaptureKind = (typeof KINDS)[number]["id"];
export const KindSchema = z.enum(["inicio", "metricas", "tablero", "avance", "fisico"]);
export const kindLabel = (k: CaptureKind) => KINDS.find((x) => x.id === k)!.label;

export const CaptureSchema = z.object({
  id: z.string().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: KindSchema,
  note: z.string().trim().max(140).default(""),
  createdAt: z.string(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});
export type Capture = z.infer<typeof CaptureSchema>;

/** Más nuevo primero; dentro del mismo día, por hora de creación. */
export const sortCaptures = (list: Capture[]) =>
  [...list].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));

/** Días seguidos con captura, terminando hoy (o ayer si hoy aún no hay). */
export function captureStreak(list: Capture[], today: string): number {
  const days = new Set(list.map((c) => c.date));
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d) && n < 2000) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function pulse(list: Capture[], today: string) {
  return { todayCount: list.filter((c) => c.date === today).length, total: list.length, streak: captureStreak(list, today) };
}

const fmtRange = (a: string, b: string) => {
  const f = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });
  return `${f.format(parseDate(a))} al ${f.format(parseDate(b))}`;
};

export interface WeekGroup {
  key: string;
  title: string;
  range: string;
  days: { date: string; items: Capture[] }[];
  count: number;
}

/** Agrupa por semana del reto (semana 1 empieza el día 1). Lo anterior al reto va aparte. */
export function groupByWeek(list: Capture[], startDate: string): WeekGroup[] {
  const map = new Map<string, WeekGroup>();
  for (const c of sortCaptures(list)) {
    const offset = diffDays(startDate, c.date);
    const week = offset < 0 ? 0 : Math.floor(offset / 7) + 1;
    const key = `w${week}`;
    if (!map.has(key)) {
      const from = week === 0 ? c.date : addDays(startDate, (week - 1) * 7);
      const to = week === 0 ? addDays(startDate, -1) : addDays(from, 6);
      map.set(key, { key, title: week === 0 ? "Antes del reto" : `Semana ${week}`, range: week === 0 ? "" : fmtRange(from, to), days: [], count: 0 });
    }
    const g = map.get(key)!;
    let day = g.days.find((d) => d.date === c.date);
    if (!day) g.days.push((day = { date: c.date, items: [] }));
    day.items.push(c);
    g.count++;
  }
  return [...map.values()];
}

/** Primera y última captura de un tipo, para "Antes y ahora". */
export function beforeAfter(list: Capture[], kind: CaptureKind): { before: Capture; after: Capture; days: number } | null {
  const of = sortCaptures(list.filter((c) => c.kind === kind));
  const after = of[0];
  const before = of.at(-1);
  if (!after || !before || after.id === before.id) return null;
  return { before, after, days: diffDays(before.date, after.date) };
}
