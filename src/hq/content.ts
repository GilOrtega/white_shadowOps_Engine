import type { ContentFormat, ContentItem, HqState } from "./schemas";

/**
 * Semana de contenido: lo que publicas cada día en 3 formatos.
 * La plantilla rápida funciona sin IA; el agente de Marca la llena con ideas a tu medida.
 */
export const DAYS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"] as const;

export const FORMATS: { id: ContentFormat; label: string; what: string; beatsLabel: string }[] = [
  { id: "guion", label: "Guion", what: "Video corto (TikTok / Reels / Shorts)", beatsLabel: "Partes del guion" },
  { id: "carrusel", label: "Carrusel", what: "Post de láminas (Instagram / TikTok fotos)", beatsLabel: "Láminas" },
  { id: "historia", label: "Historia", what: "Historia de 24 h (detrás de cámaras)", beatsLabel: "Secuencia" },
];

/** Qué toca cada día: un ángulo distinto para no repetir el mismo video 7 veces. */
const ANGLES = [
  { angle: "Arranque", guion: (p: string) => `Semana nueva: lo que voy a cumplir en ${p}`, carrusel: (p: string) => `El plan de esta semana: ${p}`, historia: "Encuesta: ¿qué quieres ver esta semana?" },
  { angle: "Error común", guion: (p: string) => `El error que casi todos cometen en ${p}`, carrusel: (p: string) => `5 errores en ${p} que te frenan`, historia: "Pregunta: ¿cuál es tu mayor bloqueo?" },
  { angle: "Proceso", guion: (p: string) => `Así se ve un día real de ${p}`, carrusel: (p: string) => `Mi sistema paso a paso: ${p}`, historia: "Detrás de cámaras del día" },
  { angle: "Números", guion: (p: string) => `Mis números honestos de ${p}`, carrusel: (p: string) => `Antes vs. ahora: ${p}`, historia: "Quiz: adivina mi avance" },
  { angle: "Tutorial", guion: (p: string) => `Cómo empezar ${p} hoy, en 3 pasos`, carrusel: (p: string) => `Guía rápida: ${p}`, historia: "Caja de preguntas: pregúntame lo que sea" },
  { angle: "Historia", guion: (p: string) => `Por qué empecé ${p} (y casi lo dejo)`, carrusel: (p: string) => `Lo que nadie te dice de ${p}`, historia: "Mi sábado sin filtro" },
  { angle: "Cierre", guion: (p: string) => `Resumen de la semana: ¿cumplí en ${p}?`, carrusel: (p: string) => `Lo que aprendí esta semana: ${p}`, historia: "Encuesta: ¿la siguiente semana más duro?" },
] as const;

const id = () => Math.random().toString(36).slice(2, 10);

export function starterWeek(pillars: string[]): ContentItem[] {
  const list = pillars.length ? pillars : ["mi reto"];
  const items: ContentItem[] = [];
  ANGLES.forEach((a, day) => {
    const p = list[day % list.length];
    const topic = p.charAt(0).toLowerCase() + p.slice(1);
    items.push({ id: id(), day, format: "guion", title: a.guion(topic), hook: "", beats: ["Gancho (0–3 s): una frase que pare el scroll", "Contexto: por qué te importa", "Lo que hice / el dato", "Cierre con una pregunta"], cta: "Sígueme para ver si lo cumplo", pillar: p, status: "idea" });
    items.push({ id: id(), day, format: "carrusel", title: a.carrusel(topic), hook: "", beats: ["Portada con la promesa", "El problema", "Punto 1", "Punto 2", "Punto 3", "Guárdalo / compártelo"], cta: "Guárdalo para después", pillar: p, status: "idea" });
    items.push({ id: id(), day, format: "historia", title: a.historia, hook: "", beats: ["Foto o video del momento", "Sticker de encuesta o pregunta"], cta: "", pillar: p, status: "idea" });
  });
  return items;
}

export const cell = (items: ContentItem[], day: number, format: ContentFormat) => items.find((i) => i.day === day && i.format === format) ?? null;

export function weekStats(items: ContentItem[]) {
  const total = items.length;
  const listo = items.filter((i) => i.status !== "idea").length;
  const publicado = items.filter((i) => i.status === "publicado").length;
  return { total, listo, publicado };
}

/** Texto listo para copiar y pegar (en tu editor, en CapCut o en Canva). */
export function asText(i: ContentItem) {
  const f = FORMATS.find((x) => x.id === i.format)!;
  return [
    `${f.label.toUpperCase()} · ${DAYS[i.day]} — ${i.title}`,
    i.hook && `Gancho: ${i.hook}`,
    ...i.beats.map((b, n) => `${n + 1}. ${b}`),
    i.cta && `Cierre: ${i.cta}`,
  ].filter(Boolean).join("\n");
}

/** Contexto que se manda al agente: tus temas, tu reto y lo que ya publicaste. */
export function contentContext(s: HqState, weekOf: string) {
  return {
    weekOf,
    pillars: s.contentWeek.pillars,
    stake: s.profile.stake,
    challengeStart: s.profile.startDate,
    weeklyClips: s.brand.weeklyClips,
    lastTitles: s.contentWeek.items.filter((i) => i.status === "publicado").map((i) => i.title).slice(0, 12),
  };
}

type AgentPiece = { title: string; hook: string; beats: string[]; cta: string; pillar: string };
export type AgentWeek = { days: { guion: AgentPiece; carrusel: AgentPiece; historia: AgentPiece }[] };

/** Convierte la respuesta del agente en las 21 casillas de la semana. */
export function fromAgent(out: AgentWeek): ContentItem[] {
  return out.days.slice(0, 7).flatMap((d, day) =>
    (["guion", "carrusel", "historia"] as const).map((format) => ({
      id: id(), day, format, title: d[format].title.slice(0, 90), hook: d[format].hook.slice(0, 200),
      beats: d[format].beats.slice(0, 10).map((b) => b.slice(0, 240)), cta: d[format].cta.slice(0, 140), pillar: d[format].pillar.slice(0, 60), status: "idea" as const,
    })),
  );
}
