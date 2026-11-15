import { z } from "zod";
import type { Word } from "../schemas/transcript";

/**
 * Motor de Shorts, fase 1: "clips del día".
 * Subes 1–6 clips del celular → se transcriben (Whisper), se ponen en vertical 1080×1920,
 * se juntan en orden y se queman subtítulos + gancho + "DÍA X DE 60".
 * Aquí solo vive lo puro (esquemas y argumentos de ffmpeg); el trabajo pesado corre en GitHub Actions.
 */

export const MAX_CLIPS = 6;
export const MAX_CLIP_BYTES = 300 * 1024 * 1024;
export const OUT = { width: 1080, height: 1920, fps: 30 } as const;

export const ShortClipSchema = z.object({
  url: z.string().url().max(600),
  pathname: z.string().min(1).max(300),
  name: z.string().max(120).default("clip"),
  size: z.number().int().min(0).max(MAX_CLIP_BYTES).default(0),
});
export type ShortClip = z.infer<typeof ShortClipSchema>;

export const ShortStatusSchema = z.enum(["queued", "rendering", "ready", "error", "approved", "discarded"]);
export type ShortStatus = z.infer<typeof ShortStatusSchema>;

export const ShortJobSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{6,24}$/),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: ShortStatusSchema,
  clips: z.array(ShortClipSchema).min(1).max(MAX_CLIPS),
  hook: z.string().trim().max(80).default(""),
  badge: z.string().trim().max(30).default(""),
  /** Fase del trabajo mientras se edita (para mostrar avance). */
  stage: z.string().max(60).default(""),
  result: z.object({ url: z.string().url().max(600), pathname: z.string().max(300), durationSec: z.number().min(0).max(600) }).nullable().default(null),
  transcript: z.string().max(4000).default(""),
  error: z.string().max(300).default(""),
});
export type ShortJob = z.infer<typeof ShortJobSchema>;

/** Lo que manda la app para crear un Short. */
export const NewShortSchema = z.object({
  clips: z.array(ShortClipSchema).min(1).max(MAX_CLIPS),
  hook: z.string().trim().max(80).default(""),
  badge: z.string().trim().max(30).default(""),
});

export const newJobId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.slice(0, 24);

export const STATUS_LABEL: Record<ShortStatus, string> = {
  queued: "En cola",
  rendering: "Editando",
  ready: "Listo para revisar",
  error: "Falló",
  approved: "Aprobado",
  discarded: "Descartado",
};

/** ¿Sigue trabajando? (la app consulta cada pocos segundos mientras haya alguno así). */
export const isActive = (s: ShortStatus) => s === "queued" || s === "rendering";

/**
 * Pone un clip en vertical 1080×1920 a 30 fps:
 * si ya es vertical se recorta al centro; si es horizontal, va completo encima de un fondo desenfocado.
 * Si el clip no trae audio, se le pone silencio para que el concat no falle.
 */
export function normalizeArgs(input: string, output: string, opts: { hasAudio: boolean; vertical: boolean }): string[] {
  const { width: W, height: H, fps } = OUT;
  const video = opts.vertical
    ? `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps},format=yuv420p[v]`
    : `[0:v]split=2[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:4[bg];[b]scale=${W}:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=${fps},format=yuv420p[v]`;
  const audioIn = opts.hasAudio ? [] : ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"];
  const audioMap = opts.hasAudio ? "0:a:0" : "1:a:0";
  return [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", input, ...audioIn,
    "-filter_complex", video,
    "-map", "[v]", "-map", audioMap,
    ...(opts.hasAudio ? [] : ["-shortest"]),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart",
    output,
  ];
}

/** Lista para el concat demuxer (escapa comillas simples). */
export const concatList = (files: string[]) => files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n";

/** Junta los clips normalizados, quema subtítulos y normaliza el volumen. */
export function finalArgs(listFile: string, assFile: string | null, output: string): string[] {
  const vf = assFile ? ["-vf", `ass=${assFile.replace(/\\/g, "/").replace(/:/g, "\\:")}`] : [];
  return [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", listFile,
    ...vf,
    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart",
    output,
  ];
}

/** Junta las palabras de cada clip en una sola línea de tiempo (cada clip empieza donde terminó el anterior). */
export function mergeWords(parts: { words: Word[]; durationSec: number }[]): { words: Word[]; durationSec: number } {
  const out: Word[] = [];
  let t = 0;
  for (const p of parts) {
    for (const w of p.words) {
      if (w.start >= p.durationSec) continue;
      out.push({ text: w.text, start: t + w.start, end: t + Math.min(w.end, p.durationSec) });
    }
    t += p.durationSec;
  }
  return { words: out, durationSec: t };
}

/** "DÍA 3 DE 60" para el día del reto (vacío fuera del reto). */
export function badgeFor(dayNumber: number, total: number) {
  return dayNumber >= 1 && dayNumber <= total ? `DÍA ${dayNumber} DE ${total}` : "";
}
