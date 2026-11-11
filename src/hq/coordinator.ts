/**
 * Sombra como coordinador: junta lo que dicen todos los agentes y lo convierte
 * en un resumen, una lista corta de alertas y UN siguiente paso.
 * Puro (sin navegador) para poder probarlo y renderizarlo en el server.
 */
import * as L from "./logic";
import type { HqState } from "./schemas";

/** Lo que el coordinador necesita saber de la Bitácora (null = aún no carga). */
export interface JournalPulse {
  todayCount: number;
  total: number;
  /** Días seguidos con al menos una captura, terminando hoy o ayer. */
  streak: number;
}

export type AlertTone = "ai" | "warn" | "good";

export interface CoordAlert {
  id: string;
  tone: AlertTone;
  agent: string;
  text: string;
  href: string;
  cta: string;
}

export interface Briefing {
  mood: L.Mood;
  headline: string;
  summary: string;
  next: CoordAlert | null;
  alerts: CoordAlert[];
}

export function briefing(s: HqState, today: string, hour: number, journal: JournalPulse | null): Briefing {
  const required = L.missionsFor(s, today).filter((m) => m.required);
  const left = required.filter((m) => !m.done);
  const info = L.challengeInfo(s.profile, today);
  const run = L.streak(s, today);
  const day = L.dayOf(s, today);
  const kcal = L.kcalOf(day);
  const alerts: CoordAlert[] = [];

  if (!s.plan) {
    alerts.push({ id: "plan", tone: "ai", agent: "Estratega", text: "Aún no tienes plan de ataque. Son 4 preguntas.", href: "/plan", cta: "Armar mi plan" });
  }
  if (journal && journal.todayCount === 0 && hour >= 5) {
    alerts.push({
      id: "capture",
      tone: "ai",
      agent: "Bitácora",
      text: hour < 12 ? "Sube la captura con la que arrancas el día." : "Hoy no hay captura en tu bitácora. Una basta.",
      href: "/bitacora?nueva=inicio",
      cta: "Subir captura",
    });
  }
  for (const m of left) {
    if (m.id === "train") alerts.push({ id: "train", tone: "warn", agent: "Coach", text: `Toca: ${m.title}.`, href: "/#misiones", cta: "Ver rutina" });
    if (m.id === "meals") alerts.push({ id: "meals", tone: "warn", agent: "Nutri", text: `Llevas ${day.meals.length} de ${L.MIN_MEALS} comidas registradas.`, href: "/#comidas", cta: "Registrar comida" });
  }
  if (day.meals.length >= L.MIN_MEALS && kcal > s.profile.calorieTarget) {
    alerts.push({
      id: "kcal",
      tone: "warn",
      agent: "Nutri",
      text: `Vas ${(kcal - s.profile.calorieTarget).toLocaleString("es-MX")} kcal arriba. No lo compenses saltándote comidas.`,
      href: "/#comidas",
      cta: "Ver comidas",
    });
  }
  if (L.agentQuestions(s, today).some((q) => q.id === "weight")) {
    alerts.push({ id: "weight", tone: "ai", agent: "Coach", text: "Toca pesarte en ayunas para que la tendencia sea real.", href: "/progreso#pesaje", cta: "Registrar peso" });
  }
  if (left.length === 0) {
    alerts.push({ id: "done", tone: "good", agent: "Sombra", text: `Día ${info.dayNumber} cumplido. Racha de ${run} ${run === 1 ? "día" : "días"}.`, href: "/progreso", cta: "Ver progreso" });
  } else if (run >= 3) {
    alerts.push({ id: "streak", tone: "good", agent: "Sombra", text: `Racha de ${run} días en juego. Hoy no se cae.`, href: "/#misiones", cta: "Ir a misiones" });
  }
  if (journal && journal.streak >= 3) {
    alerts.push({ id: "jstreak", tone: "good", agent: "Bitácora", text: `${journal.streak} días seguidos documentando tu avance.`, href: "/bitacora", cta: "Ver línea de tiempo" });
  }

  const next = alerts.find((a) => a.tone !== "good") ?? null;
  const done = required.length - left.length;
  const mood: L.Mood = left.length === 0 ? "fiesta" : hour >= 18 && done === 0 ? "preocupado" : done > 0 ? "fuego" : "listo";
  const headline =
    left.length === 0
      ? "Día cumplido. Así se remonta."
      : done === 0
        ? hour >= 18
          ? "El día sigue en ceros, todavía alcanzas."
          : `Día ${info.dayNumber}: a arrancar.`
        : `Vas ${done} de ${required.length}. No lo dejes a medias.`;
  const summary = `Día ${info.dayNumber} de ${s.profile.challengeDays}, ${done} de ${required.length} misiones, racha de ${run}.`;
  return { mood, headline, summary, next, alerts: alerts.slice(0, 5) };
}

/** El tip que Sombra deja al entrar a cada pantalla. */
export function pageTip(path: string, s: HqState, today: string, journal: JournalPulse | null): string {
  if (path.startsWith("/progreso")) {
    const rate = L.weeklyRate(L.weightSeries(s));
    if (rate === null) return "Con 7 días de pesajes te digo tu ritmo real por semana.";
    if (rate < -L.MAX_LOSS_PER_WEEK) return "Bajas más de 1 kg por semana: es mucho. Sube un poco las calorías.";
    if (rate < -0.2) return `Vas ${Math.abs(rate).toFixed(1)} kg por semana hacia abajo. Ritmo sano, no lo apures.`;
    return "La tendencia manda, no el pesaje de un día. Mira la línea, no los puntos.";
  }
  if (path.startsWith("/bitacora")) {
    if (!journal || journal.total === 0) return "Sube tu primera captura: en unas semanas vas a querer ver de dónde saliste.";
    if (journal.todayCount === 0) return "Falta la captura de hoy. Pega una con Ctrl+V o arrástrala aquí.";
    return `Llevas ${journal.total} ${journal.total === 1 ? "captura" : "capturas"}. Usa "Antes y ahora" para ver la diferencia.`;
  }
  if (path.startsWith("/plan")) return s.plan ? "El plan solo se cambia con 2 semanas de datos y si cumpliste." : "4 preguntas y te armo la semana completa.";
  if (path.startsWith("/engine")) return "El motor de shorts ya corre en tu compu. Lo siguiente es subir el video desde aquí.";
  if (path.startsWith("/ajustes")) return s.accessKey ? "La clave está puesta: Nutri, Coach y yo ya podemos usar IA." : "Pon tu clave de acceso para que la IA se active.";
  const b = briefing(s, today, 12, journal);
  return b.next ? b.next.text : b.headline;
}
