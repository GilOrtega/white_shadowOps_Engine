import { z } from "zod";
import { WordSchema } from "../schemas/transcript";

/** Rectángulo normalizado (0..1) sobre el frame de origen. */
export const NormRectSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().gt(0).max(1),
    h: z.number().gt(0).max(1),
  })
  .refine((r) => r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001, { message: "El rectángulo se sale del frame" });
export type NormRect = z.infer<typeof NormRectSchema>;

/**
 * Cómo convertir 16:9 → 9:16.
 * - center-crop: recorta una franja vertical (bien para cámara/talking head).
 * - blur-fill: video completo al centro + fondo desenfocado (bien para pantalla con código).
 * - split: facecam arriba + pantalla abajo (el formato típico de streams de dev).
 */
export const LayoutSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("center-crop"),
    /** Centro horizontal del recorte (0 = izquierda, 1 = derecha). */
    focusX: z.number().min(0).max(1).default(0.5),
  }),
  z.object({
    mode: z.literal("blur-fill"),
    blurRadius: z.number().int().min(2).max(60).default(24),
  }),
  z.object({
    mode: z.literal("split"),
    top: NormRectSchema,
    bottom: NormRectSchema,
    /** Porción de la altura de salida para el panel de arriba. */
    topRatio: z.number().min(0.2).max(0.8).default(0.4),
  }),
]);
export type Layout = z.infer<typeof LayoutSchema>;

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hex #RRGGBB");

export const SubtitleStyleSchema = z.object({
  fontName: z.string().min(1).default("Arial"),
  fontSize: z.number().int().min(24).max(200).default(84),
  primaryColor: HexColor.default("#FFFFFF"),
  highlightColor: HexColor.default("#FFD400"),
  outlineColor: HexColor.default("#000000"),
  outline: z.number().min(0).max(20).default(6),
  bold: z.boolean().default(true),
  uppercase: z.boolean().default(true),
  maxWordsPerChunk: z.number().int().min(1).max(6).default(3),
  /** Corte de chunk si hay una pausa mayor a esto entre palabras. */
  maxGapSec: z.number().min(0.1).max(3).default(0.6),
  /** Distancia desde abajo; deja libre la zona de botones de TikTok/Reels. */
  marginV: z.number().int().min(0).max(1500).default(560),
});
export type SubtitleStyle = z.infer<typeof SubtitleStyleSchema>;

export const OutputSpecSchema = z.object({
  width: z.number().int().positive().multipleOf(2).default(1080),
  height: z.number().int().positive().multipleOf(2).default(1920),
  fps: z.number().int().min(15).max(60).optional(),
  crf: z.number().int().min(14).max(32).default(20),
  preset: z.enum(["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow"]).default("veryfast"),
  audioBitrate: z.string().regex(/^\d+k$/).default("160k"),
  /** Normaliza a -14 LUFS (lo que esperan TikTok/Reels/Shorts). */
  normalizeAudio: z.boolean().default(true),
});
export type OutputSpec = z.infer<typeof OutputSpecSchema>;

export const RenderJobSchema = z
  .object({
    jobId: z.string().regex(/^[\w-]{1,64}$/, "jobId solo letras, números, _ y -"),
    /** Ruta local al video original (el worker lo descarga antes desde GCS/Blob). */
    sourcePath: z.string().min(1),
    clip: z.object({
      id: z.string().regex(/^[\w-]{1,64}$/),
      startTime: z.number().nonnegative(),
      endTime: z.number().positive(),
    }),
    /** Palabras con timestamps ABSOLUTOS del video original. */
    words: z.array(WordSchema).default([]),
    layout: LayoutSchema.default({ mode: "blur-fill", blurRadius: 24 }),
    subtitles: SubtitleStyleSchema.nullable().prefault({}),
    /** Auto-Hook: texto en pantalla de los primeros segundos (null = sin gancho). */
    hook: z.object({ text: z.string().trim().min(1).max(80), durationSec: z.number().min(0.5).max(6).default(2.8) }).nullable().default(null),
    output: OutputSpecSchema.prefault({}),
    outDir: z.string().min(1),
    /** Re-renderiza aunque ya exista el archivo. */
    force: z.boolean().default(false),
    timeoutMs: z.number().int().positive().default(10 * 60_000),
  })
  .refine((j) => j.clip.endTime > j.clip.startTime, { message: "endTime debe ser > startTime", path: ["clip"] });
export type RenderJobInput = z.input<typeof RenderJobSchema>;
export type RenderJob = z.infer<typeof RenderJobSchema>;

export const VideoProbeSchema = z.object({
  durationSec: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  hasAudio: z.boolean(),
  videoCodec: z.string(),
});
export type VideoProbe = z.infer<typeof VideoProbeSchema>;

export interface RenderResult {
  jobId: string;
  clipId: string;
  outputPath: string;
  assPath: string | null;
  durationSec: number;
  bytes: number;
  cached: boolean;
  elapsedMs: number;
  ffmpegArgs: string[];
}
