import { z } from "zod";

/**
 * Transcripción normalizada. Cualquier proveedor (Whisper, Deepgram)
 * se mapea a este formato en `src/engine/ingest/*` (Fase 2), así el resto
 * del pipeline no sabe de dónde vino.
 */
export const WordSchema = z.object({
  text: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
});

export const TranscriptSegmentSchema = z
  .object({
    id: z.number().int().nonnegative(),
    start: z.number().nonnegative(), // segundos
    end: z.number().nonnegative(),
    text: z.string(),
    speaker: z.string().optional(),
    /** Timestamps por palabra: los usará el motor de subtítulos dinámicos. */
    words: z.array(WordSchema).optional(),
  })
  .refine((s) => s.end >= s.start, { message: "end debe ser >= start", path: ["end"] });

export const TranscriptSchema = z
  .object({
    sourceId: z.string().min(1),
    language: z.string().default("es"),
    durationSec: z.number().positive(),
    segments: z.array(TranscriptSegmentSchema).min(1),
  })
  .superRefine((t, ctx) => {
    const seen = new Set<number>();
    for (let i = 0; i < t.segments.length; i++) {
      const cur = t.segments[i]!;
      if (seen.has(cur.id)) {
        ctx.addIssue({ code: "custom", message: `id de segmento duplicado: ${cur.id}`, path: ["segments", i, "id"] });
        return;
      }
      seen.add(cur.id);
      if (i > 0 && cur.start < t.segments[i - 1]!.start) {
        ctx.addIssue({ code: "custom", message: "Los segmentos deben venir ordenados por start", path: ["segments", i] });
        return;
      }
    }
  });

export type Word = z.infer<typeof WordSchema>;
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;
