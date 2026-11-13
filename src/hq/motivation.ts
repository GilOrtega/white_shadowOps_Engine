import { dayChecklist, evolution, flameOf } from "./flames";
import * as L from "./logic";
import type { HqState } from "./schemas";

/**
 * Frase del banner del gym. Si vas fallando, te habla golpeado (sin humillar);
 * si vas bien, te empuja. Cambia por día para no repetir siempre la misma.
 */
export type Banner = { tone: "fuego" | "regaño"; text: string; sub: string };

const PUSH = [
  "Disciplina es hacerlo aunque no tengas ganas.",
  "Cada serie de hoy es una excusa menos.",
  "Los resultados llegan callados. Tú sigue.",
  "No entrenas para hoy: entrenas para el que vas a ser en 60 días.",
  "El dolor de hoy es la foto de antes y después de mañana.",
  "Nadie se acuerda de los días fáciles. Hazlo contar.",
  "Uno más. Siempre uno más.",
];
const SCOLD = [
  "¿Así quieres cumplir tus sueños? No mames, ponte a jalar.",
  "Nadie va a venir a hacerlo por ti. Mueve el trasero.",
  "Tu yo del futuro te está viendo. No lo dejes en ridículo.",
  "El cansancio se te pasa. El arrepentimiento no.",
  "Dijiste que ibas en serio. Demuéstralo hoy, no mañana.",
  "Las excusas no queman calorías.",
];

const pick = <T,>(list: T[], date: string) => list[[...date].reduce((n, c) => n + c.charCodeAt(0), 0) % list.length]!;

export function gymBanner(s: HqState, today: string, hour: number): Banner {
  const yesterday = L.addDays(today, -1);
  const missedYesterday = yesterday >= s.profile.startDate && yesterday in s.days && flameOf(s, yesterday) === "none";
  const c = dayChecklist(s, today);
  const day = L.dayOf(s, today);
  const late = hour >= 19 && c.pct < 0.8;
  const noGym = hour >= 18 && !day.trainingDone;
  const over = day.meals.length > 0 && L.kcalOf(day) > s.profile.calorieTarget;
  const ev = evolution(s, today);

  if (late) return { tone: "regaño", text: pick(SCOLD, today), sub: `${c.missing === 1 ? "Te falta 1" : `Te faltan ${c.missing}`} para la flama de hoy y ya son las ${hour}:00. ${s.profile.stake ? `Recuerda: ${s.profile.stake.replace(/[.\s]+$/, "")}.` : ""}`.trim() };
  if (noGym) return { tone: "regaño", text: pick(SCOLD, today), sub: "Todavía no marcas el entrenamiento. Ve ahorita, aunque sea la versión corta." };
  if (missedYesterday) return { tone: "regaño", text: pick(SCOLD, today), sub: "Ayer no hubo flama. Hoy se recupera, no se llora." };
  if (over) return { tone: "regaño", text: "Te pasaste de calorías. Que el entrenamiento lo valga.", sub: `${L.kcalOf(day).toLocaleString("es-MX")} de ${s.profile.calorieTarget.toLocaleString("es-MX")} kcal.` };
  const flames = ev.current ? ev.current.flames : 7;
  const sub = ev.next
    ? `${flames} de 7 flamas esta semana · ${ev.toNext === 1 ? "1 semana perfecta" : `${ev.toNext} semanas perfectas`} para ${ev.next.name}.`
    : `${ev.form.name}: ${ev.streak} semanas perfectas seguidas.`;
  return { tone: "fuego", text: pick(PUSH, today), sub };
}
