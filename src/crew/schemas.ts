import { z } from "zod";
import { ClipSchema } from "@/engine/schemas/clip";

/**
 * Modelo del Stream Crew (estudio de shorts). Interfaces estrictas: hoy se guardan en
 * IndexedDB del navegador; mañana el mismo contrato va a Postgres/Firestore cambiando
 * solo `repo.ts`.
 */

export const ToneSchema = z.enum(["tecnico", "motivacional", "viral"]);
export type Tone = z.infer<typeof ToneSchema>;

export const LengthSchema = z.enum(["corto", "medio", "largo"]);
export type ClipLength = z.infer<typeof LengthSchema>;

/** Respuestas del Agente 0 (briefing): sin esto el Crew trabaja a ciegas. */
export const BriefSchema = z.object({
  highlight: z.string().trim().max(240).default(""),
  tone: ToneSchema.default("motivacional"),
  clipCount: z.number().int().min(1).max(8).default(3),
  length: LengthSchema.default("corto"),
});
export type Brief = z.infer<typeof BriefSchema>;

export const StageIdSchema = z.enum(["transcript", "miner", "editor", "copy", "publisher", "ataque"]);
export type StageId = z.infer<typeof StageIdSchema>;

export const StageStatusSchema = z.enum(["pending", "running", "done", "failed", "waiting", "local"]);
export type StageStatus = z.infer<typeof StageStatusSchema>;

export const StageStateSchema = z.object({
  status: StageStatusSchema.default("pending"),
  pct: z.number().min(0).max(100).default(0),
  detail: z.string().max(200).default(""),
  log: z.array(z.string().max(300)).max(60).default([]),
  inputTokens: z.number().int().min(0).default(0),
  outputTokens: z.number().int().min(0).default(0),
  startedAt: z.string().nullable().default(null),
  endedAt: z.string().nullable().default(null),
});
export type StageState = z.infer<typeof StageStateSchema>;

export const PlatformSchema = z.enum(["tiktok", "reels", "shorts"]);
export type Platform = z.infer<typeof PlatformSchema>;

/** Lo que escribe el Copywriter (Agente 4) por clip; todo editable en la revisión. */
export const CopySchema = z.object({
  title: z.string().max(100),
  caption: z.string().max(600),
  hashtags: z.array(z.string().max(40)).max(10),
});
export type ClipCopy = z.infer<typeof CopySchema>;

export const ReviewClipSchema = z.object({
  clip: ClipSchema,
  /** Texto en pantalla de los primeros ~3 s (Auto-Hook). */
  hook: z.string().max(80),
  /** Posición vertical de los subtítulos: 0 = arriba, 1 = abajo. */
  captionY: z.number().min(0.3).max(0.85).default(0.68),
  copy: CopySchema.nullable().default(null),
  decision: z.enum(["pendiente", "aprobado", "descartado"]).default("pendiente"),
});
export type ReviewClip = z.infer<typeof ReviewClipSchema>;

export const JobStatusSchema = z.enum(["running", "review", "approved", "failed"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const StreamJobSchema = z.object({
  v: z.literal(1).default(1),
  id: z.string().regex(/^[\w-]{1,64}$/),
  createdAt: z.string(),
  title: z.string().max(120),
  demo: z.boolean().default(false),
  source: z.object({
    fileName: z.string().max(200),
    sourceId: z.string().max(200),
    durationSec: z.number().nonnegative(),
    segments: z.number().int().nonnegative(),
    hasWords: z.boolean(),
  }),
  brief: BriefSchema,
  /** Ángulo que sugirió el Plan de ataque (Agente 6) con los datos del reto de ese día. */
  angle: z.string().max(300).default(""),
  status: JobStatusSchema,
  stages: z.record(StageIdSchema, StageStateSchema),
  clips: z.array(ReviewClipSchema).max(20).default([]),
  error: z.string().max(400).nullable().default(null),
});
export type StreamJob = z.infer<typeof StreamJobSchema>;

// --- contrato del endpoint SSE del Miner ---------------------------------------------
export type MineEvent =
  | { type: "start"; windows: number; segments: number }
  | { type: "window"; index: number; done: number; total: number; candidates: number; inputTokens: number; outputTokens: number; error?: string }
  | { type: "result"; clips: z.infer<typeof ClipSchema>[]; dropped: number; inputTokens: number; outputTokens: number; elapsedMs: number }
  | { type: "error"; code: string; message: string };
