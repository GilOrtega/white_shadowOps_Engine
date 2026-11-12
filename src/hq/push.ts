import { z } from "zod";
import * as H from "./habits";
import { proposals, topIdea } from "./insights";
import * as L from "./logic";
import type { HqState } from "./schemas";

/**
 * Avisos push de "Rapo a la 0". Puro: lo usan el navegador (para mandar el resumen)
 * y el cron del servidor (para decidir si avisa). El servidor nunca ve tus comidas ni tu peso:
 * solo este resumen del día.
 */
export const PushSnapshotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Zona horaria IANA del celular (p. ej. America/Hermosillo). */
  tz: z.string().min(3).max(64),
  required: z.array(z.enum(["train", "meals", "kcal"])).max(3),
  left: z.array(z.enum(["train", "meals", "kcal"])).max(3),
  over: z.boolean(),
  dayNumber: z.number().int().min(1).max(400),
  daysLeft: z.number().int().min(0).max(400),
  mascotName: z.string().max(20),
  /** Hábitos con hora (solo título y horario; nada de salud). */
  habits: z.array(z.object({
    id: z.string().max(40), title: z.string().max(50), emoji: z.string().max(8),
    time: z.string().regex(/^\d{2}:\d{2}$/), days: z.array(z.number().int().min(0).max(6)).max(7), done: z.boolean(),
  })).max(24).default([]),
  /** La propuesta principal del agente, para el aviso de la mañana. */
  idea: z.object({ title: z.string().max(120), body: z.string().max(200) }).nullable().default(null),
});
export type PushSnapshot = z.infer<typeof PushSnapshotSchema>;

const MISSION_IDS = ["train", "meals", "kcal"] as const;
type MissionId = (typeof MISSION_IDS)[number];
const isMission = (id: string): id is MissionId => (MISSION_IDS as readonly string[]).includes(id);

export function snapshotOf(s: HqState, today: string, tz: string, approvedClipsThisWeek = 0): PushSnapshot {
  const required = L.missionsFor(s, today).filter((m) => m.required);
  const d = L.dayOf(s, today);
  const info = L.challengeInfo(s.profile, today);
  return {
    date: today,
    tz,
    required: required.map((m) => m.id).filter(isMission),
    left: required.filter((m) => !m.done).map((m) => m.id).filter(isMission),
    over: d.meals.length >= L.MIN_MEALS && L.kcalOf(d) > s.profile.calorieTarget,
    dayNumber: info.dayNumber,
    daysLeft: info.daysLeft,
    mascotName: s.profile.mascotName,
    habits: s.habits.filter((h) => h.time && h.kind === "hacer").map((h) => ({ id: h.id, title: h.title, emoji: h.emoji, time: h.time!, days: h.days, done: H.isDone(s, h, today) })),
    idea: topIdea(proposals(s, today, 9, { journal: null, approvedClipsThisWeek })),
  };
}

/** Recordatorios que tocan ahora: ya pasó su hora (hasta 90 min) y no están marcados hoy. */
export function dueReminders(snap: PushSnapshot | null, date: string, hhmm: string): PushSnapshot["habits"] {
  if (!snap) return [];
  const fresh = snap.date === date;
  const wd = L.weekdayIndex(date);
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const now = toMin(hhmm);
  return snap.habits.filter((h) => h.days.includes(wd) && !(fresh && h.done) && toMin(h.time) <= now && now - toMin(h.time) <= 90);
}

/** Fecha y hora local en la zona del usuario (el cron corre en UTC). */
export function localClock(now: Date, tz: string): { date: string; hour: number; hhmm: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), hhmm: `${get("hour")}:${get("minute")}` };
}

export interface PushMessage {
  level: "atento" | "peligro";
  title: string;
  body: string;
  /** Una vez por nivel por día: el servidor no repite el mismo aviso. */
  dedupeKey: string;
}

/**
 * ¿Hay que avisar? Si el último resumen es de otro día, hoy no has registrado nada:
 * se asume que te falta todo.
 */
export function pushDecision(snap: PushSnapshot | null, date: string, hour: number): PushMessage | null {
  const base = snap ?? { date: "", required: ["train", "meals", "kcal"], left: ["train", "meals", "kcal"], over: false, dayNumber: 0, daysLeft: 0, mascotName: "Sombra" };
  const fresh = base.date === date;
  const required = fresh ? base.required : (["train", "meals", "kcal"] as MissionId[]);
  const left = fresh ? base.left : required;
  const info = L.dangerCore({ hour, required, left, over: fresh ? base.over : false });
  if (info.level !== "atento" && info.level !== "peligro") return null;
  const who = base.mascotName || "Sombra";
  const days = fresh && base.daysLeft > 0 ? ` · faltan ${base.daysLeft} días para el veredicto` : "";
  return {
    level: info.level,
    title: info.level === "peligro" ? `💈 ${info.title}` : `${who}: ${info.title.toLowerCase()}`,
    body: `${info.detail}${days}`,
    dedupeKey: `${date}:${info.level}:${info.title}`,
  };
}
