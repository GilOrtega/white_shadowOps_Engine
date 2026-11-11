import type { DayLog, Feeling, HqState, Plan, Profile } from "./schemas";

/**
 * Lógica pura del centro de mando (sin React, sin red): fechas, misiones,
 * racha, niveles, tendencia de peso, plan semanal y estado de los agentes.
 * Todo recibe `today` como parámetro para poder probarse.
 */

// --- fechas (día local, formato AAAA-MM-DD) ----------------------------------
const pad = (n: number) => String(n).padStart(2, "0");
export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
export const diffDays = (from: string, to: string) =>
  Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
/** 0 = lunes … 6 = domingo. */
export const weekdayIndex = (s: string) => (parseDate(s).getDay() + 6) % 7;
export const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

export const emptyDay = (date: string): DayLog => ({
  date, trainingDone: false, clipDone: false, weightKg: null, feeling: null, meals: [], focusBlocks: 0,
});
export const dayOf = (s: HqState, date: string): DayLog => s.days[date] ?? emptyDay(date);
export const kcalOf = (d: DayLog) => d.meals.reduce((sum, m) => sum + m.kcal, 0);
export const proteinOf = (d: DayLog) => d.meals.reduce((sum, m) => sum + (m.proteinG ?? 0), 0);

// --- reto ----------------------------------------------------------------------
export function challengeInfo(p: Profile, today: string) {
  const raw = diffDays(p.startDate, today) + 1;
  const dayNumber = Math.min(Math.max(raw, 1), p.challengeDays);
  return {
    dayNumber,
    daysLeft: Math.max(0, p.challengeDays - Math.max(raw, 0)),
    pct: Math.round((dayNumber / p.challengeDays) * 100),
    endDate: addDays(p.startDate, p.challengeDays - 1),
    finished: raw > p.challengeDays,
    notStarted: raw < 1,
  };
}

// --- entrenamiento ---------------------------------------------------------------
export const ROUTINES = {
  A: {
    name: "Día A: pierna + empuje",
    exercises: ["Sentadilla o prensa 3×10", "Press de banca 3×10", "Peso muerto rumano 3×10", "Press militar 3×10", "Plancha 3×40 s"],
  },
  B: {
    name: "Día B: jalón + pierna",
    exercises: ["Jalón al pecho 3×10", "Remo 3×10", "Zancadas 3×10 por pierna", "Curl femoral 3×12", "Bíceps y tríceps 3×12"],
  },
} as const;

export interface Training {
  kind: "gym" | "walk" | "rest";
  title: string;
  detail: string;
  exercises: readonly string[];
}

export function trainingFor(plan: Plan | null, date: string): Training {
  const wd = weekdayIndex(date);
  if (!plan) {
    return { kind: "walk", title: "Entrena o camina 30 min", detail: "El Estratega te arma la rutina cuando contestes sus 4 preguntas", exercises: [] };
  }
  const sorted = [...plan.gymDays].sort((a, b) => a - b);
  const idx = sorted.indexOf(wd);
  if (idx >= 0) {
    const r = idx % 2 === 0 ? ROUTINES.A : ROUTINES.B;
    return { kind: "gym", title: `Gym — ${r.name}`, detail: "60 min · deja 1 o 2 repeticiones en reserva", exercises: r.exercises };
  }
  if (wd === 6) {
    return { kind: "rest", title: "Descanso activo: caminata suave", detail: "20 a 30 min · hoy toca pesaje y fotos", exercises: [] };
  }
  return { kind: "walk", title: "Caminar 40 min", detail: "Paso ligero · cuenta para el déficit", exercises: [] };
}

export function isContentDay(plan: Plan | null, date: string): boolean {
  if (!plan) return false;
  if (plan.content === "diario") return true;
  if (plan.content === "tres") return [0, 2, 4].includes(weekdayIndex(date));
  return false;
}

// --- misiones --------------------------------------------------------------------
export const MIN_MEALS = 2;

export interface Mission {
  id: "train" | "meals" | "kcal" | "clip";
  title: string;
  detail: string;
  agent: string;
  done: boolean;
  /** Las automáticas se cumplen solas con lo que registras. */
  auto: boolean;
  required: boolean;
}

export function missionsFor(s: HqState, date: string): Mission[] {
  const d = dayOf(s, date);
  const t = trainingFor(s.plan, date);
  const kcal = kcalOf(d);
  const target = s.profile.calorieTarget;
  const enoughMeals = d.meals.length >= MIN_MEALS;
  const list: Mission[] = [
    { id: "train", title: t.title, detail: t.detail, agent: "Coach", done: d.trainingDone, auto: false, required: true },
    {
      id: "meals", title: "Registrar tus comidas", agent: "Nutri", auto: true, required: true, done: enoughMeals,
      detail: `${d.meals.length} registrada${d.meals.length === 1 ? "" : "s"} · mínimo ${MIN_MEALS}`,
    },
    {
      id: "kcal", title: `No pasarte de ${target.toLocaleString("es-MX")} kcal`, agent: "Nutri", auto: true, required: true,
      done: enoughMeals && kcal <= target,
      detail: `${kcal.toLocaleString("es-MX")} de ${target.toLocaleString("es-MX")} kcal`,
    },
  ];
  if (isContentDay(s.plan, date)) {
    list.push({ id: "clip", title: "Grabar un clip de 20 s", detail: "Bonus · lo fuerte en los primeros 3 segundos", agent: "Miner", done: d.clipDone, auto: false, required: false });
  }
  return list;
}

export const isDayComplete = (s: HqState, date: string) =>
  date in s.days && missionsFor(s, date).filter((m) => m.required).every((m) => m.done);

export function streak(s: HqState, today: string): number {
  let d = isDayComplete(s, today) ? today : addDays(today, -1);
  let n = 0;
  while (n < 2000 && isDayComplete(s, d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

// --- medidor "Rapo a la 0": qué tan en riesgo está el día de hoy ----------------
export type DangerLevel = "cumplido" | "ok" | "atento" | "peligro";
export interface DangerInfo {
  level: DangerLevel;
  /** 0 = tranquilo, 100 = el día se pierde. */
  pct: number;
  title: string;
  detail: string;
  /** Horas que quedan para cerrar el día (hasta medianoche). */
  hoursLeft: number;
}

/**
 * Riesgo del día según la hora y lo que falta. Reglas fijas para que sea predecible:
 * sin comidas a las 14 h o sin entrenar a las 18 h → atento; a las 20/21 h → peligro.
 * Pasarse de calorías con el día ya registrado = peligro (ese día ya no cuenta).
 */
export function dangerInfo(s: HqState, today: string, hour: number): DangerInfo {
  const required = missionsFor(s, today).filter((m) => m.required);
  const d = dayOf(s, today);
  return dangerCore({
    hour,
    required: required.map((m) => m.id),
    left: required.filter((m) => !m.done).map((m) => m.id),
    over: d.meals.length >= MIN_MEALS && kcalOf(d) > s.profile.calorieTarget,
  });
}

/**
 * Regla compartida por la app y por el aviso push del servidor (que solo recibe un resumen,
 * no tus datos completos). `left`/`required` son ids de misión: "train" | "meals" | "kcal".
 */
export function dangerCore(x: { hour: number; required: string[]; left: string[]; over: boolean }): DangerInfo {
  const hoursLeft = Math.max(0, 24 - x.hour);
  if (x.left.length === 0) return { level: "cumplido", pct: 0, title: "Día asegurado", detail: "La máquina se queda guardada hoy.", hoursLeft };
  if (x.over) return { level: "peligro", pct: 100, title: "Te pasaste de calorías", detail: "Hoy ya no cuenta como cumplido. Mañana se retoma normal, sin compensar.", hoursLeft };

  const noMeals = x.left.includes("meals");
  const noTrain = x.left.includes("train");
  const late = (noMeals && x.hour >= 20) || (noTrain && x.hour >= 21);
  const warn = (noMeals && x.hour >= 14) || (noTrain && x.hour >= 18);
  const base = Math.round((x.hour / 24) * (x.left.length / Math.max(x.required.length, 1)) * 100);
  const pct = late ? Math.max(base, 85) : warn ? Math.max(base, 60) : Math.min(base, 45);
  const what = x.left.filter((id) => !(id === "kcal" && noMeals)).map((id) => (id === "train" ? "entrenar" : id === "meals" ? "registrar comidas" : "cuidar calorías")).join(" y ");
  if (late) return { level: "peligro", pct, title: `Quedan ${hoursLeft} h`, detail: `Te falta ${what}. Si hoy se cae, la máquina se acerca.`, hoursLeft };
  if (warn) return { level: "atento", pct, title: "Vas tarde", detail: `Te falta ${what}. Todavía alcanzas.`, hoursLeft };
  return { level: "ok", pct, title: "En tiempo", detail: `Te falta ${what}. Primero lo difícil.`, hoursLeft };
}

export const XP = { day: 100, clip: 25, weight: 10, perLevel: 300 } as const;

export function progress(s: HqState) {
  let xp = 0;
  let completeDays = 0;
  for (const date of Object.keys(s.days)) {
    const d = s.days[date]!;
    if (isDayComplete(s, date)) {
      xp += XP.day;
      completeDays++;
    }
    if (d.clipDone) xp += XP.clip;
    if (d.weightKg !== null) xp += XP.weight;
  }
  return { xp, completeDays, level: Math.floor(xp / XP.perLevel) + 1, intoLevel: xp % XP.perLevel, perLevel: XP.perLevel };
}

/** Rangos: uno por nivel; al pasar el último se gana un prestigio y se vuelve a empezar. */
export const RANKS = ["Recluta", "Soldado", "Cabo", "Sargento", "Teniente", "Capitán", "Mayor", "Coronel", "General", "Leyenda"] as const;

export function rankInfo(xp: number) {
  const level = Math.floor(xp / XP.perLevel);
  const tier = level % RANKS.length;
  const next = (tier + 1) % RANKS.length;
  return {
    tier,
    name: RANKS[tier]!,
    prestige: Math.floor(level / RANKS.length),
    into: xp % XP.perLevel,
    toNext: XP.perLevel - (xp % XP.perLevel),
    nextName: next === 0 ? `Prestigio ${Math.floor(level / RANKS.length) + 1}` : RANKS[next]!,
  };
}

export type GridState = "done" | "missed" | "today" | "future";
/** Un cuadro por cada día del reto: el mapa completo de la remontada. */
export function challengeGrid(s: HqState, today: string): { n: number; date: string; state: GridState }[] {
  return Array.from({ length: s.profile.challengeDays }, (_, i) => {
    const date = addDays(s.profile.startDate, i);
    const state: GridState = isDayComplete(s, date) ? "done" : date === today ? "today" : date < today ? "missed" : "future";
    return { n: i + 1, date, state };
  });
}

export function lastDays(s: HqState, today: string, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, -(n - 1 - i));
    const d = dayOf(s, date);
    return { date, complete: isDayComplete(s, date), trained: d.trainingDone, meals: d.meals.length, kcal: kcalOf(d), weightKg: d.weightKg, feeling: d.feeling };
  });
}

// --- peso ------------------------------------------------------------------------
export interface WeightPoint {
  date: string;
  kg: number;
  /** Promedio móvil de 7 días: lo que de verdad importa, no un día suelto. */
  trend: number;
}

export function weightSeries(s: HqState): WeightPoint[] {
  const raw = Object.values(s.days)
    .filter((d) => d.weightKg !== null)
    .map((d) => ({ date: d.date, kg: d.weightKg as number }));
  if (!raw.some((r) => r.date === s.profile.startDate)) raw.push({ date: s.profile.startDate, kg: s.profile.startWeightKg });
  raw.sort((a, b) => (a.date < b.date ? -1 : 1));
  return raw.map((p) => {
    const win = raw.filter((q) => q.date <= p.date && diffDays(q.date, p.date) <= 6);
    return { ...p, trend: win.reduce((sum, q) => sum + q.kg, 0) / win.length };
  });
}

/** Cambio de la tendencia en kg por semana (negativo = bajando). Null si faltan datos. */
export function weeklyRate(series: WeightPoint[]): number | null {
  const last = series.at(-1);
  if (!last) return null;
  const base = [...series].reverse().find((p) => diffDays(p.date, last.date) >= 7);
  if (!base) return null;
  return (last.trend - base.trend) / (diffDays(base.date, last.date) / 7);
}

/** Bajar más rápido que esto no es parte del plan. */
export const MAX_LOSS_PER_WEEK = 1;

// --- el Coach (reglas fijas; la IA solo explica, no rompe estas reglas) -----------
export function coachNote(s: HqState, today: string): string {
  const d = dayOf(s, today);
  const series = weightSeries(s);
  const rate = weeklyRate(series);
  const week = lastDays(s, today, 7);
  const done = week.filter((x) => x.complete).length;
  const lastWeight = [...series].reverse().find((p) => p.date !== s.profile.startDate || s.days[p.date]?.weightKg != null);
  const daysSinceWeight = lastWeight ? diffDays(lastWeight.date, today) : null;

  if (d.feeling === "fundido") return "Hoy baja la intensidad: misma rutina, una serie menos. Lo importante es ir.";
  if (rate !== null && rate < -MAX_LOSS_PER_WEEK) return "Vas bajando más de 1 kg por semana. Sube un poco las calorías: más rápido no es mejor.";
  if (s.profile.goalWeightKg !== null) {
    const info = challengeInfo(s.profile, today);
    const current = series.at(-1)?.trend ?? s.profile.startWeightKg;
    const weeksLeft = Math.max(info.daysLeft, 1) / 7;
    if ((current - s.profile.goalWeightKg) / weeksLeft > MAX_LOSS_PER_WEEK) {
      return "Tu meta pide bajar más de 1 kg por semana. Yo no voy a empujar eso: apunto a 0.5–0.8 kg y la meta se ajusta.";
    }
  }
  if (daysSinceWeight === null || daysSinceWeight >= 7) return "Sin báscula no hay datos. Pésate mañana en ayunas, después de ir al baño.";
  if (done < 4) return `Cumpliste ${done} de los últimos 7 días. El plan no se cambia: se arregla la constancia.`;
  if (rate !== null && Math.abs(rate) < 0.2 && done >= 5 && series.length >= 4 && diffDays(series[0]!.date, today) >= 14) {
    return "Cumpliste y el peso no se mueve. Ajuste chico: 150 kcal menos o 10 minutos más de caminata.";
  }
  if (d.feeling === "con_todo") return "Hoy vas con todo: sube 2.5 kg en el primer ejercicio si la técnica sale limpia.";
  return "Vas bien. Mismo plan, un día a la vez.";
}

// --- agentes ---------------------------------------------------------------------
export type AgentStatus = "working" | "needs" | "done" | "idle";
export interface AgentCard {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  statusLabel: string;
  task: string;
  pct: number;
}

const GOAL_LABEL: Record<Plan["goal"], string> = { bajar: "bajar de peso", musculo: "ganar músculo", ambas: "bajar y ganar músculo" };

export function agentCards(s: HqState, today: string): AgentCard[] {
  const d = dayOf(s, today);
  const t = trainingFor(s.plan, today);
  const kcal = kcalOf(d);
  const target = s.profile.calorieTarget;
  return [
    s.plan
      ? { id: "estratega", name: "Estratega", role: "Plan de ataque", status: "done", statusLabel: "Plan activo", task: `${s.plan.gymDays.length} días de gym por semana · objetivo: ${GOAL_LABEL[s.plan.goal]}.`, pct: 100 }
      : { id: "estratega", name: "Estratega", role: "Plan de ataque", status: "needs", statusLabel: "Te necesita", task: "Contesta 4 preguntas y te armo la semana.", pct: 0 },
    d.trainingDone
      ? { id: "coach", name: "Coach", role: "Entrenamiento", status: "done", statusLabel: "Listo", task: `Hecho: ${t.title}.`, pct: 100 }
      : { id: "coach", name: "Coach", role: "Entrenamiento", status: "needs", statusLabel: "Te toca", task: `Hoy toca: ${t.title}.`, pct: 0 },
    d.meals.length === 0
      ? { id: "nutri", name: "Nutri", role: "Calorías por foto", status: "needs", statusLabel: "Te necesita", task: "Registra tu primera comida de hoy, con foto o a mano.", pct: 0 }
      : { id: "nutri", name: "Nutri", role: "Calorías por foto", status: kcal > target ? "needs" : "working", statusLabel: kcal > target ? "Te pasaste" : "Contando", task: `${d.meals.length} comida${d.meals.length === 1 ? "" : "s"} · ${kcal.toLocaleString("es-MX")} de ${target.toLocaleString("es-MX")} kcal.`, pct: Math.min(100, Math.round((kcal / target) * 100)) },
    { id: "miner", name: "Miner", role: "Busca los mejores clips", status: "idle", statusLabel: "En tu compu", task: "Motor listo. Por ahora corre en tu compu con npm run pipeline.", pct: 0 },
    { id: "editor", name: "Editor", role: "Vertical 9:16 + subtítulos", status: "idle", statusLabel: "En tu compu", task: "Recorte y subtítulos listos en el motor. Falta conectarlo a la nube.", pct: 0 },
    { id: "publisher", name: "Publisher", role: "Copy, hashtags y publicación", status: "idle", statusLabel: "Pendiente", task: "Falta construirlo: conectar TikTok, Reels y Shorts.", pct: 0 },
  ];
}

export type AgentQuestion =
  | { id: "plan"; agent: string; text: string; kind: "link"; href: string; cta: string }
  | { id: "weight" | "goal"; agent: string; text: string; kind: "number"; unit: string }
  | { id: "feeling"; agent: string; text: string; kind: "choice"; options: { value: Feeling; label: string }[] };

export function agentQuestions(s: HqState, today: string): AgentQuestion[] {
  const d = dayOf(s, today);
  const out: AgentQuestion[] = [];
  if (!s.plan) out.push({ id: "plan", agent: "Estratega", kind: "link", href: "/plan", cta: "Empezar entrevista", text: "Necesito 4 respuestas tuyas para armar el plan de ataque." });
  if (d.weightKg === null) {
    const logged = Object.values(s.days).filter((x) => x.weightKg !== null).map((x) => x.date).sort();
    const last = logged.at(-1);
    if (!last || diffDays(last, today) >= 3 || weekdayIndex(today) === 6) {
      out.push({ id: "weight", agent: "Coach", kind: "number", unit: "kg", text: "¿Cuánto pesaste hoy en ayunas?" });
    }
  }
  if (!d.trainingDone && d.feeling === null) {
    out.push({
      id: "feeling", agent: "Coach", kind: "choice", text: "¿Cómo te sientes hoy para entrenar?",
      options: [{ value: "con_todo", label: "Con todo" }, { value: "normal", label: "Normal" }, { value: "fundido", label: "Fundido" }],
    });
  }
  if (s.profile.goalWeightKg === null) out.push({ id: "goal", agent: "Estratega", kind: "number", unit: "kg", text: `¿A qué peso quieres llegar el día ${s.profile.challengeDays}?` });
  return out;
}

// --- entrevista del Estratega ------------------------------------------------------
export const INTERVIEW = [
  { key: "goal", label: "Objetivo", q: "¿Qué es lo más importante para ti en lo que queda del reto?", why: "Decide si priorizo el déficit de calorías o la fuerza.",
    options: [{ value: "bajar", label: "Bajar de peso" }, { value: "musculo", label: "Ganar músculo" }, { value: "ambas", label: "Las dos" }] },
  { key: "days", label: "Días de gym", q: "¿Cuántos días a la semana puedes ir al gym sin fallar?", why: "Prefiero un plan que sí cumplas a uno perfecto que abandones.",
    options: [{ value: "3", label: "3 días" }, { value: "4", label: "4 días" }, { value: "5", label: "5 días" }] },
  { key: "time", label: "Horario", q: "¿A qué hora entrenas mejor?", why: "Así sé a qué hora esperarte.",
    options: [{ value: "manana", label: "Mañana" }, { value: "tarde", label: "Tarde" }, { value: "noche", label: "Noche" }] },
  { key: "content", label: "Contenido", q: "¿Cuánto quieres grabar para TikTok?", why: "Los días de clip te aparece una misión bonus.",
    options: [{ value: "diario", label: "Un clip diario" }, { value: "tres", label: "3 por semana" }, { value: "resultado", label: "Solo el resultado" }] },
] as const;

const GYM_DAYS: Record<string, number[]> = { "3": [0, 2, 4], "4": [0, 1, 3, 4], "5": [0, 1, 2, 3, 4] };

export function buildPlan(answers: readonly string[], nowIso: string): Plan | null {
  const [goal, days, time, content] = answers;
  const gymDays = days ? GYM_DAYS[days] : undefined;
  if (!goal || !gymDays || !time || !content) return null;
  return { goal: goal as Plan["goal"], gymDays, time: time as Plan["time"], content: content as Plan["content"], createdAt: nowIso };
}

export const TIME_LABEL: Record<Plan["time"], string> = { manana: "en la mañana", tarde: "en la tarde", noche: "en la noche" };

export function planWeek(plan: Plan) {
  // Lunes de una semana cualquiera: solo importa el día de la semana.
  const monday = "2026-11-09";
  return WEEKDAYS.map((day, i) => {
    const date = addDays(monday, i);
    const t = trainingFor(plan, date);
    const extra = [t.kind === "gym" ? TIME_LABEL[plan.time] : "", isContentDay(plan, date) ? "grabar clip" : "", i === 6 ? "pesaje y fotos" : ""].filter(Boolean).join(" · ");
    return { day, gym: t.kind === "gym", main: t.kind === "gym" ? t.title.replace("Gym — ", "") : t.title, extra };
  });
}

export const fmtKg = (n: number) => `${n.toFixed(1)} kg`;

// --- la mascota ------------------------------------------------------------------
export type Mood = "listo" | "fuego" | "fiesta" | "preocupado";
export interface MascotSay { mood: Mood; text: string }
export type MascotAsk = "animo" | "ahora" | "sin_ganas";

const pick = <T,>(list: readonly T[], seed: number): T => list[((seed % list.length) + list.length) % list.length]!;

/** Lo que dice la mascota al abrir la app: depende de cómo va tu día y de la hora. */
export function mascotLine(s: HqState, today: string, hour: number): MascotSay {
  const required = missionsFor(s, today).filter((m) => m.required);
  const left = required.filter((m) => !m.done);
  const info = challengeInfo(s.profile, today);
  const t = trainingFor(s.plan, today);
  const seed = info.dayNumber;
  if (left.length === 0) {
    return { mood: "fiesta", text: pick([`¡Eso! Día ${info.dayNumber} en la bolsa. Mañana otra vez.`, "Otro cuadro verde. Así se remonta.", "Cumpliste. Hoy sí puedes verte al espejo con ganas."], seed) };
  }
  if (left.length < required.length) {
    return { mood: "fuego", text: `Ya arrancaste, no lo dejes a medias. Te falta: ${left[0]!.title}.` };
  }
  const yesterday = addDays(today, -1);
  if (yesterday >= s.profile.startDate && !isDayComplete(s, yesterday) && progress(s).completeDays > 0) {
    return { mood: "fuego", text: "Ayer se cayó. No pasa nada, siempre que hoy no se caiga también." };
  }
  if (hour >= 18) return { mood: "preocupado", text: `Ya es tarde y el día sigue en ceros. Todavía alcanzas: ${t.title}.` };
  if (hour < 12) return { mood: "listo", text: `Buenos días. Hoy toca: ${t.title}. Primero lo difícil.` };
  return { mood: "listo", text: "El día no se cumple solo. Empieza por registrar lo que comiste." };
}

/** Respuestas fijas de la mascota (sin IA): siempre funcionan. */
export function mascotReply(ask: MascotAsk, s: HqState, today: string): MascotSay {
  const required = missionsFor(s, today).filter((m) => m.required);
  const left = required.filter((m) => !m.done);
  const info = challengeInfo(s.profile, today);
  const prog = progress(s);
  if (ask === "animo") {
    const change = (weightSeries(s).at(-1)?.trend ?? s.profile.startWeightKg) - s.profile.startWeightKg;
    const kg = change < -0.05 ? ` y ${Math.abs(change).toFixed(1)} kg menos que el día 1` : "";
    return prog.completeDays > 0
      ? { mood: "fuego", text: `Llevas ${prog.completeDays} ${prog.completeDays === 1 ? "día cumplido" : "días cumplidos"}${kg}. Eso lo hiciste tú, nadie te lo regaló. Faltan ${info.daysLeft}: uno por uno.` }
      : { mood: "fuego", text: `Todos empiezan en cero. El primer cuadro verde es el más difícil y lo puedes poner hoy. Faltan ${info.daysLeft} días: alcanza.` };
  }
  if (ask === "sin_ganas") {
    return { mood: "listo", text: "Nadie tiene ganas siempre. Haz el día mínimo: 30 minutos caminando y tus comidas registradas. Eso vale mucho más que cero." };
  }
  const next = left[0];
  if (!next) return { mood: "fiesta", text: "Nada. Ya cumpliste. Cena tranquilo y duerme 7 horas: ahí también se avanza." };
  if (next.id === "train") return { mood: "fuego", text: `Ponte los tenis y ve: ${next.title}. No lo pienses, solo llega.` };
  if (next.id === "meals") return { mood: "listo", text: "Registra lo último que comiste. Es un minuto y ya llevas una misión menos." };
  return dayOf(s, today).meals.length >= MIN_MEALS
    ? { mood: "preocupado", text: "Hoy ya te pasaste de calorías. No lo compenses saltándote comidas: mañana se retoma normal." }
    : { mood: "listo", text: "Registra tu siguiente comida para que el Nutri lleve la cuenta." };
}
