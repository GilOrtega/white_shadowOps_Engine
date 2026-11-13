import type { HqState, Plan } from "./schemas";
import { EXERCISES } from "./exercise-db.gen";

/**
 * Programa de entrenamiento del reto. Reglas fijas y conservadoras (las del Coach):
 * split según tus días de gym, fases por semana del reto, doble progresión y descarga.
 * Puro: se prueba en scripts/training.selftest.ts.
 */
export interface Lift { name: string; muscle: string; cue: string; alt: string; lower: boolean }

export const LIB: Record<string, Lift> = {
  sentadilla: { name: "Sentadilla con barra", muscle: "Cuádriceps y glúteo", cue: "Pecho arriba, rodillas siguen la punta del pie", alt: "Prensa o sentadilla goblet", lower: true },
  prensa: { name: "Prensa de pierna", muscle: "Cuádriceps", cue: "Baja hasta 90°, no despegues la espalda baja", alt: "Hack squat", lower: true },
  pesoMuerto: { name: "Peso muerto rumano", muscle: "Femoral y glúteo", cue: "Cadera atrás, barra pegada a las piernas", alt: "Peso muerto con mancuernas", lower: true },
  hipThrust: { name: "Hip thrust", muscle: "Glúteo", cue: "Mentón abajo, aprieta 1 s arriba", alt: "Puente de glúteo con barra", lower: true },
  zancada: { name: "Zancada búlgara", muscle: "Cuádriceps y glúteo", cue: "Torso firme, la rodilla de atrás casi toca", alt: "Zancadas caminando", lower: true },
  femoral: { name: "Curl femoral", muscle: "Femoral", cue: "Baja en 3 segundos", alt: "Curl nórdico asistido", lower: true },
  extension: { name: "Extensión de cuádriceps", muscle: "Cuádriceps", cue: "Pausa arriba 1 s", alt: "Sissy squat asistida", lower: true },
  pantorrilla: { name: "Elevación de pantorrilla", muscle: "Pantorrilla", cue: "Rango completo, pausa abajo", alt: "Pantorrilla en prensa", lower: true },
  banca: { name: "Press de banca", muscle: "Pecho", cue: "Escápulas juntas, barra a la línea del pezón", alt: "Press con mancuernas", lower: false },
  inclinado: { name: "Press inclinado con mancuernas", muscle: "Pecho alto", cue: "30°, codos a 45°", alt: "Press inclinado en máquina", lower: false },
  militar: { name: "Press militar", muscle: "Hombro", cue: "Glúteo apretado, sin arquear la espalda", alt: "Press con mancuernas sentado", lower: false },
  lateral: { name: "Elevaciones laterales", muscle: "Hombro lateral", cue: "Sube hasta el hombro, sin impulso", alt: "Laterales en polea", lower: false },
  jalon: { name: "Jalón al pecho", muscle: "Espalda (dorsal)", cue: "Lleva los codos a la bolsa del pantalón", alt: "Dominadas asistidas", lower: false },
  dominada: { name: "Dominadas", muscle: "Espalda (dorsal)", cue: "Pecho a la barra, baja controlado", alt: "Jalón al pecho", lower: false },
  remo: { name: "Remo con barra", muscle: "Espalda media", cue: "Torso a 45°, jala al ombligo", alt: "Remo en máquina", lower: false },
  remoMancuerna: { name: "Remo con mancuerna", muscle: "Espalda", cue: "Codo pegado, sin girar el torso", alt: "Remo en polea baja", lower: false },
  facePull: { name: "Face pull", muscle: "Hombro posterior", cue: "Jala a la frente, abre los codos", alt: "Pájaros con mancuerna", lower: false },
  fondos: { name: "Fondos o press cerrado", muscle: "Tríceps y pecho", cue: "Codos atrás, baja a 90°", alt: "Extensión de tríceps en polea", lower: false },
  triceps: { name: "Extensión de tríceps en polea", muscle: "Tríceps", cue: "Codos fijos", alt: "Press francés", lower: false },
  curl: { name: "Curl de bíceps", muscle: "Bíceps", cue: "Sin balancear, baja en 2 s", alt: "Curl martillo", lower: false },
  plancha: { name: "Plancha", muscle: "Core", cue: "Glúteo y abdomen apretados, línea recta", alt: "Dead bug", lower: false },
};

/** Prescripción: series × rango de reps, descanso y repeticiones en reserva (RIR). */
export interface Rx { id: keyof typeof LIB; sets: number; reps: [number, number]; rest: number; unit?: "reps" | "seg" }
export interface Session { key: string; name: string; focus: string; main: Rx[] }

const S = (key: string, name: string, focus: string, main: Rx[]): Session => ({ key, name, focus, main });
const SESSIONS = {
  fullA: S("fullA", "Cuerpo completo A", "Fuerza base: sentadilla y empujes", [
    { id: "sentadilla", sets: 3, reps: [6, 8], rest: 150 }, { id: "banca", sets: 3, reps: [6, 8], rest: 150 }, { id: "remo", sets: 3, reps: [8, 10], rest: 120 },
    { id: "pesoMuerto", sets: 2, reps: [8, 10], rest: 120 }, { id: "lateral", sets: 2, reps: [12, 15], rest: 60 }, { id: "plancha", sets: 3, reps: [30, 45], rest: 45, unit: "seg" }]),
  fullB: S("fullB", "Cuerpo completo B", "Bisagra de cadera y jalones", [
    { id: "pesoMuerto", sets: 3, reps: [6, 8], rest: 150 }, { id: "militar", sets: 3, reps: [6, 8], rest: 120 }, { id: "jalon", sets: 3, reps: [8, 10], rest: 120 },
    { id: "zancada", sets: 2, reps: [8, 10], rest: 90 }, { id: "curl", sets: 2, reps: [10, 12], rest: 60 }, { id: "triceps", sets: 2, reps: [10, 12], rest: 60 }]),
  fullC: S("fullC", "Cuerpo completo C", "Volumen: prensa, inclinado y espalda", [
    { id: "prensa", sets: 3, reps: [10, 12], rest: 120 }, { id: "inclinado", sets: 3, reps: [8, 10], rest: 120 }, { id: "remoMancuerna", sets: 3, reps: [10, 12], rest: 90 },
    { id: "hipThrust", sets: 3, reps: [10, 12], rest: 90 }, { id: "facePull", sets: 2, reps: [12, 15], rest: 60 }, { id: "pantorrilla", sets: 3, reps: [12, 15], rest: 60 }]),
  upperA: S("upperA", "Torso A (fuerza)", "Pecho y espalda pesado", [
    { id: "banca", sets: 4, reps: [5, 7], rest: 180 }, { id: "remo", sets: 4, reps: [6, 8], rest: 150 }, { id: "militar", sets: 3, reps: [8, 10], rest: 120 },
    { id: "jalon", sets: 3, reps: [8, 10], rest: 90 }, { id: "curl", sets: 2, reps: [10, 12], rest: 60 }, { id: "triceps", sets: 2, reps: [10, 12], rest: 60 }]),
  lowerA: S("lowerA", "Pierna A (fuerza)", "Sentadilla pesada", [
    { id: "sentadilla", sets: 4, reps: [5, 7], rest: 180 }, { id: "pesoMuerto", sets: 3, reps: [8, 10], rest: 150 }, { id: "zancada", sets: 3, reps: [8, 10], rest: 90 },
    { id: "femoral", sets: 3, reps: [10, 12], rest: 75 }, { id: "pantorrilla", sets: 3, reps: [10, 15], rest: 60 }, { id: "plancha", sets: 3, reps: [30, 45], rest: 45, unit: "seg" }]),
  upperB: S("upperB", "Torso B (volumen)", "Inclinado, dorsal y hombro", [
    { id: "inclinado", sets: 4, reps: [8, 10], rest: 120 }, { id: "dominada", sets: 4, reps: [6, 10], rest: 120 }, { id: "remoMancuerna", sets: 3, reps: [10, 12], rest: 90 },
    { id: "lateral", sets: 3, reps: [12, 15], rest: 60 }, { id: "facePull", sets: 3, reps: [12, 15], rest: 60 }, { id: "fondos", sets: 2, reps: [8, 12], rest: 90 }]),
  lowerB: S("lowerB", "Pierna B (volumen)", "Cadera y glúteo", [
    { id: "pesoMuerto", sets: 4, reps: [6, 8], rest: 150 }, { id: "prensa", sets: 3, reps: [10, 12], rest: 120 }, { id: "hipThrust", sets: 3, reps: [8, 12], rest: 90 },
    { id: "extension", sets: 3, reps: [12, 15], rest: 60 }, { id: "femoral", sets: 3, reps: [10, 12], rest: 60 }, { id: "pantorrilla", sets: 3, reps: [12, 15], rest: 60 }]),
  push: S("push", "Empuje", "Pecho, hombro y tríceps", [
    { id: "banca", sets: 4, reps: [6, 8], rest: 150 }, { id: "militar", sets: 3, reps: [8, 10], rest: 120 }, { id: "inclinado", sets: 3, reps: [10, 12], rest: 90 },
    { id: "lateral", sets: 3, reps: [12, 15], rest: 60 }, { id: "fondos", sets: 2, reps: [8, 12], rest: 90 }, { id: "triceps", sets: 2, reps: [10, 12], rest: 60 }]),
  pull: S("pull", "Jalón", "Espalda y bíceps", [
    { id: "dominada", sets: 4, reps: [6, 10], rest: 150 }, { id: "remo", sets: 3, reps: [8, 10], rest: 120 }, { id: "remoMancuerna", sets: 3, reps: [10, 12], rest: 90 },
    { id: "facePull", sets: 3, reps: [12, 15], rest: 60 }, { id: "curl", sets: 3, reps: [10, 12], rest: 60 }]),
  legs: S("legs", "Pierna", "Cuádriceps, femoral y glúteo", [
    { id: "sentadilla", sets: 4, reps: [6, 8], rest: 180 }, { id: "pesoMuerto", sets: 3, reps: [8, 10], rest: 150 }, { id: "prensa", sets: 3, reps: [10, 12], rest: 120 },
    { id: "femoral", sets: 3, reps: [10, 12], rest: 75 }, { id: "pantorrilla", sets: 4, reps: [10, 15], rest: 60 }]),
} satisfies Record<string, Session>;

/** El split según cuántos días vas al gym. */
export const SPLITS: Record<number, Session[]> = {
  1: [SESSIONS.fullA],
  2: [SESSIONS.fullA, SESSIONS.fullB],
  3: [SESSIONS.fullA, SESSIONS.fullB, SESSIONS.fullC],
  4: [SESSIONS.upperA, SESSIONS.lowerA, SESSIONS.upperB, SESSIONS.lowerB],
  5: [SESSIONS.upperA, SESSIONS.lowerA, SESSIONS.push, SESSIONS.pull, SESSIONS.legs],
  6: [SESSIONS.push, SESSIONS.pull, SESSIONS.legs, SESSIONS.push, SESSIONS.pull, SESSIONS.legs],
};
export const SPLIT_NAME: Record<number, string> = { 1: "Cuerpo completo", 2: "Cuerpo completo A/B", 3: "Cuerpo completo A/B/C", 4: "Torso / Pierna", 5: "Torso / Pierna + Empuje / Jalón / Pierna", 6: "Empuje / Jalón / Pierna ×2" };

/** Fase del reto por semana: adaptación → construcción → descarga → pico. */
export interface Phase { name: string; week: number; setDelta: number; rir: string; note: string }
export function phaseFor(week: number): Phase {
  if (week <= 2) return { name: "Adaptación", week, setDelta: -1, rir: "3", note: "Aprende la técnica; termina cada serie con 3 reps en reserva." };
  if (week <= 6) return { name: "Construcción", week, setDelta: 0, rir: "1–2", note: "Doble progresión: cuando completes el rango alto en todas las series, sube peso." };
  if (week === 7) return { name: "Descarga", week, setDelta: -1, rir: "4", note: "Semana ligera: mismo ejercicio, 10 % menos peso. Recuperas para el cierre." };
  return { name: "Pico", week, setDelta: 0, rir: "0–1", note: "Cierre del reto: series exigentes con técnica limpia." };
}

const FINISHER: Record<Plan["goal"], { title: string; detail: string }> = {
  bajar: { title: "Cardio 15 min", detail: "Caminadora inclinada 10–12 % a 5–6 km/h (zona 2: puedes hablar con frases cortas)" },
  ambas: { title: "Intervalos 10 min", detail: "Bici: 30 s fuerte / 60 s suave × 7" },
  musculo: { title: "Core 8 min", detail: "Plancha 3×40 s + dead bug 3×10 por lado" },
};
const STEPS: Record<Plan["goal"], number> = { bajar: 10000, ambas: 9000, musculo: 7000 };

export const WARMUP = ["5 min de bici o caminadora suave", "Movilidad: 10 círculos de cadera y 10 de hombro", "2 series ligeras del primer ejercicio (50 % y 75 % del peso de trabajo)"];
export const MOBILITY = ["Gato-vaca × 10", "Estiramiento de flexor de cadera 40 s por lado", "Rotaciones torácicas × 8 por lado", "Sentadilla profunda sostenida 60 s"];

export interface Workout {
  kind: "gym" | "walk" | "rest";
  title: string;
  detail: string;
  session: Session | null;
  /** Ejercicios ya ajustados a la fase (series). */
  rx: Rx[];
  phase: Phase;
  warmup: string[];
  finisher: { title: string; detail: string } | null;
  mobility: string[];
  steps: number;
  minutes: number;
  split: string;
}

const weekdayIndex = (date: string) => (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86_400_000);

export function workoutFor(plan: Plan | null, date: string, startDate: string): Workout {
  const week = Math.max(1, Math.floor(daysBetween(startDate, date) / 7) + 1);
  const phase = phaseFor(week);
  const goal = plan?.goal ?? "ambas";
  const base = { phase, warmup: WARMUP, mobility: MOBILITY, steps: STEPS[goal] };
  if (!plan) {
    return { ...base, kind: "walk", title: "Contesta las 4 preguntas del plan", detail: `Mientras: ${STEPS.ambas.toLocaleString("es-MX")} pasos y 10 min de movilidad`, session: null, rx: [], finisher: null, minutes: 40, split: "Sin plan" };
  }
  const days = [...plan.gymDays].sort((a, b) => a - b);
  const split = SPLITS[Math.min(6, days.length)]!;
  const wd = weekdayIndex(date);
  const idx = days.indexOf(wd);
  if (idx >= 0) {
    // La rotación avanza por semana para que con 1–3 días no siempre toque la misma sesión.
    const session = split[(idx + (split.length > days.length ? week - 1 : 0)) % split.length]!;
    const rx = session.main.map((r) => ({ ...r, sets: Math.max(2, r.sets + phase.setDelta) }));
    const minutes = 10 + rx.reduce((n, r) => n + r.sets * (45 + r.rest), 0) / 60 + 12;
    return { ...base, kind: "gym", title: `Gym — ${session.name}`, detail: `${session.focus} · ${Math.round(minutes / 5) * 5} min · RIR ${phase.rir}`, session, rx, finisher: FINISHER[goal], minutes: Math.round(minutes / 5) * 5, split: SPLIT_NAME[Math.min(6, days.length)]! };
  }
  if (wd === 6) {
    return { ...base, kind: "rest", title: "Descanso activo", detail: `Caminata suave 30 min · movilidad 10 min · pesaje y fotos`, session: null, rx: [], finisher: null, minutes: 40, split: SPLIT_NAME[Math.min(6, days.length)]! };
  }
  return { ...base, kind: "walk", title: `${STEPS[goal].toLocaleString("es-MX")} pasos + movilidad`, detail: "Caminata a paso ligero (cuenta para el déficit) y 10 min de movilidad", session: null, rx: [], finisher: null, minutes: 50, split: SPLIT_NAME[Math.min(6, days.length)]! };
}

/** Texto de cada ejercicio para resúmenes ("Press de banca 3×6–8"). */
export const rxLine = (r: Rx) => `${LIB[r.id]!.name} ${r.sets}×${r.reps[0]}–${r.reps[1]}${r.unit === "seg" ? " s" : ""}`;

// --- registro y progresión ----------------------------------------------------------------
export interface LiftLog { kg: number | null; reps: number[] }

/** Última vez que hiciste ese ejercicio (antes de `date`). */
/**
 * Llave del registro: si cambiaste el ejercicio por otro, su progreso se lleva aparte
 * (no se comparan kilos de sentadilla con kilos de prensa).
 */
export const logKey = (id: string, swap?: string | null) => (swap ? `${id}~${swap}` : id);

export function lastLog(s: HqState, id: string, date: string): { date: string; log: LiftLog } | null {
  const dates = Object.keys(s.days).filter((d) => d < date).sort().reverse();
  for (const d of dates) {
    const log = s.days[d]?.lifts?.[id];
    if (log && log.reps.some((r) => r > 0)) return { date: d, log };
  }
  return null;
}

/** Doble progresión: si completaste el rango alto en todas las series, sube; si no, repite peso. */
export function suggestion(s: HqState, r: Rx, date: string, phase: Phase): string {
  const last = lastLog(s, r.id, date);
  if (r.unit === "seg") return last ? `La vez pasada: ${last.log.reps.filter(Boolean).join(", ")} s. Busca ${r.reps[1]} s.` : `Aguanta ${r.reps[0]}–${r.reps[1]} s con buena forma.`;
  if (!last || last.log.kg === null) return `Elige un peso que te deje ${phase.rir} reps en reserva en la última serie.`;
  const { kg, reps } = last.log;
  const done = reps.filter((x) => x > 0);
  const [base, swapId] = r.id.split("~");
  const light = swapId ? ["Mancuernas", "Polea", "Liga", "Kettlebell"].includes(EXERCISES[swapId]?.equipment ?? "") : false;
  const step = LIB[base!]!.lower && !light ? 5 : 2.5;
  if (kg === 0) {
    if (done.length >= r.sets && done.every((x) => x >= r.reps[1])) return `Completaste ${r.reps[1]} con tu peso: hoy agrega 2.5 kg con cinturón o una pausa de 2 s abajo.`;
    return `La vez pasada (tu peso): ${done.join(", ")}. Busca ${r.reps[1]} reps en todas.`;
  }
  if (phase.name === "Descarga") return `Descarga: ${Math.round(kg! * 0.9 * 2) / 2} kg (10 % menos que tus ${kg} kg).`;
  if (done.length >= r.sets && done.every((x) => x >= r.reps[1])) return `¡Subiste! Completaste ${r.reps[1]} reps en todo: hoy ${kg! + step} kg.`;
  return `La vez pasada: ${kg} kg × ${done.join(", ")}. Repite ${kg} kg y busca ${r.reps[1]} reps en todas.`;
}

/** Volumen del día (kg × reps) para la gráfica de progreso. */
export const volumeOf = (lifts: Record<string, LiftLog> | undefined) =>
  Object.values(lifts ?? {}).reduce((n, l) => n + (l.kg ?? 0) * l.reps.reduce((a, b) => a + b, 0), 0);
