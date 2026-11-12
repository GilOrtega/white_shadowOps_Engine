import * as F from "./facets";
import * as H from "./habits";
import * as L from "./logic";
import type { HqState } from "./schemas";

/**
 * Agente proactivo (Estratega + Sombra): mira tus datos y PROPONE. Nada cambia hasta que aceptas
 * (como el check-in semanal de MacroFactor). Reglas fijas y explicables; la IA solo agrega ideas extra.
 */
export type ProposalAction =
  | { kind: "calories"; delta: number }
  | { kind: "focusGoal"; value: number }
  | { kind: "habit"; preset: H.HabitPreset }
  | { kind: "habitTime"; habitId: string; time: string }
  | { kind: "link"; href: string; label: string };

export interface Proposal {
  /** Estable por regla + datos: si lo descartas hoy, no vuelve a salir hoy. */
  id: string;
  facet: F.FacetId;
  agent: string;
  title: string;
  /** Por qué lo propone (el dato concreto). */
  why: string;
  action: ProposalAction;
  cta: string;
  /** 0 = urgente … 3 = cuando puedas. */
  priority: number;
}

export function proposals(s: HqState, today: string, hour: number, ctx: F.FacetContext): Proposal[] {
  const out: Proposal[] = [];
  const day = L.dayOf(s, today);
  const target = s.profile.calorieTarget;

  // Cuerpo — estancamiento de peso (como MacroFactor: −100 kcal, tú decides).
  const series = L.weightSeries(s);
  const rate = L.weeklyRate(series);
  const weighIns = series.filter((p) => L.diffDays(p.date, today) <= 14).length;
  if (rate !== null && weighIns >= 3 && rate > -0.15 && target - 100 >= 1500) {
    out.push({
      id: `cal-down-${today.slice(0, 7)}-${target}`, facet: "cuerpo", agent: "Nutri", priority: 1,
      title: `Bajar tu meta a ${(target - 100).toLocaleString("es-MX")} kcal`,
      why: `Tu tendencia de peso se movió ${rate >= 0 ? "+" : ""}${rate.toFixed(2)} kg/semana: estás estancado. Un ajuste pequeño y sostenible.`,
      action: { kind: "calories", delta: -100 }, cta: "Aplicar −100 kcal",
    });
  }
  if (rate !== null && rate < -L.MAX_LOSS_PER_WEEK) {
    out.push({
      id: `cal-up-${today.slice(0, 7)}-${target}`, facet: "cuerpo", agent: "Nutri", priority: 0,
      title: `Subir tu meta a ${(target + 100).toLocaleString("es-MX")} kcal`,
      why: `Vas a ${rate.toFixed(2)} kg/semana, más rápido de lo sano. Perderías músculo y energía para entrenar.`,
      action: { kind: "calories", delta: 100 }, cta: "Aplicar +100 kcal",
    });
  }
  if (weighIns < 3 && !s.habits.some((h) => /pes/i.test(h.title))) {
    out.push({
      id: "habit-pesarme", facet: "cuerpo", agent: "Coach", priority: 2,
      title: "Pésate diario en ayunas",
      why: `Solo hay ${weighIns} pesada${weighIns === 1 ? "" : "s"} en 2 semanas. Sin datos no puedo ajustar tus calorías; con la tendencia diaria se quita el ruido.`,
      action: { kind: "habit", preset: H.PRESETS.find((p) => p.title === "Pesarme")! }, cta: "Agregar recordatorio 7:30",
    });
  }

  // Hábitos — arranque y rescate (Fabulous: empieza chico; ancla los nuevos a algo que ya haces).
  if (s.habits.length === 0) {
    out.push({
      id: "habit-starter-creatina", facet: "cuerpo", agent: "Coach", priority: 1,
      title: "Arma tus hábitos base, empezando por la creatina",
      why: "No tienes hábitos con recordatorio. Ancla cada uno a algo que ya haces (después del desayuno) para que no dependa de acordarte.",
      action: { kind: "habit", preset: H.PRESETS[0]! }, cta: "Agregar creatina 9:00",
    });
  }
  for (const h of s.habits) {
    const r = H.weekRate(s, h, today);
    if (r !== null && r < 0.5 && h.kind === "hacer" && h.time) {
      const [hh, mm] = h.time.split(":").map(Number) as [number, number];
      const earlier = `${String(Math.max(6, hh - 1)).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      if (earlier !== h.time) {
        out.push({
          id: `habit-move-${h.id}-${earlier}`, facet: h.facet, agent: "Sombra", priority: 2,
          title: `Mover "${h.title}" a las ${earlier}`,
          why: `Lo cumpliste ${Math.round(r * 100)}% de los días esta semana. A las ${h.time} se te va; una hora antes, pegado a ${h.anchor || "tu rutina"}, es más fácil.`,
          action: { kind: "habitTime", habitId: h.id, time: earlier }, cta: `Cambiar a ${earlier}`,
        });
      }
    }
  }

  // Trabajo — entrega cerca y poco enfoque.
  const due = F.nextDeadline(s, today);
  const focusWeek = L.lastDays(s, today, 7).reduce((n, d) => n + L.dayOf(s, d.date).focusBlocks, 0) / 7;
  if (due && due.inDays >= 0 && due.inDays <= 3 && s.work.focusGoal < 4) {
    out.push({
      id: `focus-up-${due.id}-${s.work.focusGoal}`, facet: "trabajo", agent: "Estratega", priority: 0,
      title: `Sube a ${s.work.focusGoal + 1} bloques diarios hasta entregar "${due.name}"`,
      why: `Se entrega en ${due.inDays === 0 ? "hoy" : `${due.inDays} día${due.inDays === 1 ? "" : "s"}`} y tu promedio es ${focusWeek.toFixed(1)} bloques al día.`,
      action: { kind: "focusGoal", value: s.work.focusGoal + 1 }, cta: `Meta: ${s.work.focusGoal + 1} bloques`,
    });
  }
  if (s.work.projects.length === 0) {
    out.push({
      id: "work-add-projects", facet: "trabajo", agent: "Estratega", priority: 3,
      title: "Registra tus proyectos de clientes",
      why: "Sin fechas de entrega no puedo avisarte cuando una se acerca ni repartirte el enfoque.",
      action: { kind: "link", href: "#trabajo", label: "Ir a Trabajo" }, cta: "Agregar proyecto",
    });
  }

  // Marca — 3 días sin clip.
  const lastClip = L.lastDays(s, today, 30).reverse().find((d) => L.dayOf(s, d.date).clipDone)?.date;
  const sinceClip = lastClip ? L.diffDays(lastClip, today) : null;
  if ((sinceClip === null || sinceClip >= 3) && ctx.approvedClipsThisWeek === 0) {
    out.push({
      id: `brand-clip-${today}`, facet: "marca", agent: "Miner", priority: 2,
      title: "Saca un clip hoy del reto",
      why: sinceClip === null ? "No hay clips registrados. Tu Día 1 enganchó: la gente quiere ver si lo cumples." : `Llevas ${sinceClip} días sin clip. Un short de 20–25 s con la báscula en los primeros 2 segundos.`,
      action: { kind: "link", href: "/crew", label: "Abrir estudio" }, cta: "Abrir estudio",
    });
  }

  // Dinero — sin meta o atrás del ritmo.
  if (s.money.monthlyGoal === null) {
    out.push({
      id: "money-goal", facet: "dinero", agent: "Estratega", priority: 3,
      title: "Ponle meta de ingresos al mes",
      why: "Con meta te digo cada día si vas al ritmo y cuánto falta.",
      action: { kind: "link", href: "#dinero", label: "Poner meta" }, cta: "Poner meta",
    });
  } else {
    const income = F.monthIncome(s, today);
    const pace = s.money.monthlyGoal * (Number(today.slice(8, 10)) / new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate());
    if (income < pace * 0.7 && Number(today.slice(8, 10)) >= 10) {
      out.push({
        id: `money-behind-${today.slice(0, 7)}-${Math.round(income)}`, facet: "dinero", agent: "Estratega", priority: 1,
        title: "Cobra o cotiza hoy",
        why: `Llevas $${Math.round(income).toLocaleString("es-MX")} y al ritmo deberías ir en $${Math.round(pace).toLocaleString("es-MX")}. Un anticipo pendiente o una cotización enviada hoy cambia el mes.`,
        action: { kind: "link", href: "#dinero", label: "Ir a Dinero" }, cta: "Ver Dinero",
      });
    }
  }

  // Mente — 2 días fundido: bajar intensidad, no saltarse el día.
  const fundido = [L.addDays(today, -1), today].filter((d) => L.dayOf(s, d).feeling === "fundido").length;
  if (fundido === 2) {
    out.push({
      id: `mind-deload-${today}`, facet: "mente", agent: "Coach", priority: 0,
      title: "Hoy versión ligera: caminar 30 min cuenta",
      why: "Llevas 2 días fundido. Bajar la intensidad sostiene la racha; tronarte la rompe.",
      action: { kind: "link", href: "/plan", label: "Ver plan" }, cta: "Ver mi plan",
    });
  }

  void day; void hour;
  return out
    .filter((p) => s.dismissed[p.id] !== today && !(p.id.startsWith("habit-starter") && s.dismissed[p.id]))
    .sort((a, b) => a.priority - b.priority);
}

/** Lo que el servidor puede mandar como "idea del día" por push (sin datos personales). */
export const topIdea = (list: Proposal[]) => (list[0] ? { title: list[0].title, body: list[0].why.slice(0, 160) } : null);
