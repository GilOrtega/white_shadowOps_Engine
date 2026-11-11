import type { Clip } from "@/engine/schemas/clip";
import * as L from "@/hq/logic";
import type { HqState } from "@/hq/schemas";
import type { Brief, ClipLength, Platform, ReviewClip, StageId, StageState, StreamJob, Tone } from "./schemas";

/** Lógica pura del Stream Crew: sin React, sin red. Todo se prueba en scripts/crew.selftest.ts. */

export const STAGES: { id: StageId; n: number; name: string; role: string }[] = [
  { id: "transcript", n: 1, name: "Transcripción", role: "Tu voz a texto con tiempos (Deepgram, en tu compu)" },
  { id: "miner", n: 2, name: "Miner", role: "Elige los momentos con más gancho" },
  { id: "editor", n: 3, name: "Editor + Auto-Hook", role: "Vertical 9:16, subtítulos y gancho de 3 s" },
  { id: "copy", n: 4, name: "Copywriter", role: "Título, descripción y hashtags" },
  { id: "publisher", n: 5, name: "Publisher", role: "TikTok, Reels y Shorts" },
  { id: "ataque", n: 6, name: "Plan de ataque", role: "Conecta el clip con tu reto de hoy" },
];

export const TONES: { value: Tone; label: string; hint: string }[] = [
  { value: "tecnico", label: "Técnico", hint: "Dato concreto, cero relleno" },
  { value: "motivacional", label: "Motivacional", hint: "Disciplina y proceso" },
  { value: "viral", label: "Agresivo / viral", hint: "Polémico, gancho fuerte" },
];

export const LENGTHS: Record<ClipLength, { label: string; min: number; max: number }> = {
  corto: { label: "20–30 s", min: 18, max: 30 },
  medio: { label: "30–45 s", min: 30, max: 45 },
  largo: { label: "45–60 s", min: 45, max: 60 },
};

const TONE_CONTEXT: Record<Tone, string> = {
  tecnico: "Prioriza momentos con un dato técnico concreto (código, arquitectura, herramientas) que se entienda solo.",
  motivacional: "Prioriza momentos de disciplina, proceso y mentalidad: confesiones, decisiones y aprendizajes.",
  viral: "Prioriza opiniones fuertes, contrastes y frases que generen debate, sin inventar ni exagerar lo que se dijo.",
};

/** Opciones del Miner a partir del briefing (Agente 0) y el ángulo del día (Agente 6). */
export function minerOptionsFor(brief: Brief, angle: string) {
  const len = LENGTHS[brief.length];
  const context = [
    brief.highlight ? `El autor dice que lo más fuerte del stream fue: ${brief.highlight}` : "",
    TONE_CONTEXT[brief.tone],
    angle ? `Ángulo del día: ${angle}` : "",
    "Canal de un ingeniero de software en Sonora que hace un reto físico público (si falla, se rapa con la 0).",
  ].filter(Boolean).join(" ").slice(0, 500);
  return { maxClipsTotal: brief.clipCount, minDurationSec: len.min, maxDurationSec: len.max, context };
}

// --- Agente 6: Plan de ataque (sincronizado con el reto) -------------------------------
export interface Angle { tone: Tone; line: string }

/**
 * Lee cómo va el reto hoy y propone el ángulo del contenido. Reglas fijas (sin IA):
 * siempre se puede explicar por qué sugirió eso.
 */
export function contentAngle(s: HqState, today: string): Angle {
  const info = L.challengeInfo(s.profile, today);
  const streak = L.streak(s, today);
  const doneToday = L.isDayComplete(s, today);
  const yesterday = L.addDays(today, -1);
  const fellYesterday = yesterday >= s.profile.startDate && !L.isDayComplete(s, yesterday) && L.progress(s).completeDays > 0;
  const series = L.weightSeries(s);
  const change = (series.at(-1)?.trend ?? s.profile.startWeightKg) - s.profile.startWeightKg;

  if (doneToday && streak >= 2) {
    return { tone: "motivacional", line: `Hoy completaste el día ${info.dayNumber} y llevas ${streak} días seguidos: el clip debe enfatizar la racha y la disciplina del reto.` };
  }
  if (fellYesterday) {
    return { tone: "motivacional", line: "Ayer se cayó el día: un clip honesto de cómo te levantas vale más que fingir que todo va perfecto." };
  }
  if (change <= -1) {
    return { tone: "motivacional", line: `Llevas ${Math.abs(change).toFixed(1)} kg menos desde el día 1: menciónalo en el gancho y cierra con la apuesta 💈.` };
  }
  if (info.daysLeft <= 7 && !info.finished) {
    return { tone: "viral", line: `Faltan ${info.daysLeft} días para el veredicto: usa la tensión de la apuesta (“si fallo me rapo”) en los primeros 2 segundos.` };
  }
  return { tone: "tecnico", line: `Día ${info.dayNumber} del reto: abre con lo técnico más concreto del stream y cierra con “Si fallo me rapo 💈”.` };
}

// --- trabajos --------------------------------------------------------------------------
const stage = (patch: Partial<StageState> = {}): StageState => ({
  status: "pending", pct: 0, detail: "", log: [], inputTokens: 0, outputTokens: 0, startedAt: null, endedAt: null, ...patch,
});

export function newJob(args: {
  id: string; now: string; fileName: string; sourceId: string; durationSec: number; segments: number; hasWords: boolean;
  brief: Brief; angle: string; demo?: boolean;
}): StreamJob {
  const fmtMin = Math.round(args.durationSec / 60);
  return {
    v: 1,
    id: args.id,
    createdAt: args.now,
    title: args.brief.highlight ? args.brief.highlight.slice(0, 80) : args.fileName.replace(/\.json$/i, ""),
    demo: args.demo ?? false,
    source: { fileName: args.fileName, sourceId: args.sourceId, durationSec: args.durationSec, segments: args.segments, hasWords: args.hasWords },
    brief: args.brief,
    angle: args.angle,
    status: "running",
    stages: {
      transcript: stage({ status: "done", pct: 100, detail: `${args.segments} segmentos · ${fmtMin} min${args.hasWords ? "" : " · sin palabras (no habrá subtítulos)"}`, startedAt: args.now, endedAt: args.now, log: [`Importada: ${args.fileName}`] }),
      miner: stage(),
      editor: stage(),
      copy: stage(),
      publisher: stage({ status: "waiting", detail: "Espera tu aprobación" }),
      ataque: stage({ status: "done", pct: 100, detail: args.angle.slice(0, 200), startedAt: args.now, endedAt: args.now }),
    },
    clips: [],
    error: null,
  };
}

export const withStage = (job: StreamJob, id: StageId, patch: Partial<StageState> | ((s: StageState) => Partial<StageState>)): StreamJob => {
  const cur = job.stages[id] ?? stage();
  const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
  return { ...job, stages: { ...job.stages, [id]: { ...next, log: next.log.slice(-60) } } };
};

/** Del Miner al tablero de revisión: el gancho arranca con lo que propuso el Miner. */
export const toReview = (clips: Clip[]): ReviewClip[] =>
  clips.map((clip) => ({ clip, hook: clip.hookText.slice(0, 80), captionY: 0.68, copy: null, decision: "pendiente" }));

/** Posición de subtítulos (0..1 desde arriba) → margen inferior ASS en px para 1920 de alto. */
export function marginVFor(captionY: number, height = 1920, fontSize = 84): number {
  return Math.max(0, Math.min(1500, Math.round((1 - captionY) * height - fontSize / 2)));
}

export const approved = (job: StreamJob) => job.clips.filter((c) => c.decision === "aprobado");

/** Archivo que lee `scripts/render.ts`: mismos `clips` del Miner + cómo renderizar cada uno. */
export function renderPlan(job: StreamJob) {
  const list = approved(job);
  return {
    kind: "wso.render-plan" as const,
    v: 1,
    jobId: job.id,
    sourceId: job.source.sourceId,
    createdAt: job.createdAt,
    clips: list.map((c) => c.clip),
    render: Object.fromEntries(list.map((c) => [c.clip.id, { hook: c.hook, hookSec: 2.8, marginV: marginVFor(c.captionY) }])),
  };
}

/** Textos listos para pegar al publicar a mano mientras el Publisher no está conectado. */
export function copyPack(job: StreamJob): string {
  return approved(job).map((c, i) => {
    const tags = c.copy?.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ") ?? "";
    return [`— Clip ${i + 1} (${fmtTime(c.clip.startTime)}–${fmtTime(c.clip.endTime)}) —`, `Gancho: ${c.hook}`, c.copy ? `Título: ${c.copy.title}` : "", c.copy ? `${c.copy.caption}\n${tags}` : ""].filter(Boolean).join("\n");
  }).join("\n\n");
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Zonas que tapa la interfaz de cada red (fracciones del cuadro 9:16, aproximadas). */
export const SAFE_ZONES: Record<Platform, { label: string; right: { top: number; bottom: number; width: number }; bottom: number; top: number }> = {
  tiktok: { label: "TikTok", right: { top: 0.42, bottom: 0.86, width: 0.15 }, bottom: 0.17, top: 0.08 },
  reels: { label: "Reels", right: { top: 0.5, bottom: 0.88, width: 0.14 }, bottom: 0.2, top: 0.07 },
  shorts: { label: "Shorts", right: { top: 0.45, bottom: 0.86, width: 0.14 }, bottom: 0.16, top: 0.06 },
};

/** ¿Los subtítulos caen dentro de lo que tapa la interfaz de esa red? */
export function captionCovered(captionY: number, p: Platform): boolean {
  const z = SAFE_ZONES[p];
  return captionY > 1 - z.bottom || captionY < z.top;
}
