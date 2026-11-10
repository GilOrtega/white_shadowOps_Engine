import { z } from "zod";

export const ClipCategorySchema = z.enum(["tecnico", "mindset", "historia", "tutorial", "opinion"]);
export type ClipCategory = z.infer<typeof ClipCategorySchema>;

/**
 * Lo que DEVUELVE el modelo. Ojo: el modelo NO inventa segundos; elige
 * rangos de IDs de segmento. Los timestamps reales los calcula el código
 * a partir de la transcripción (cero timestamps alucinados).
 */
export const MinerCandidateSchema = z
  .object({
    startSegmentId: z.number().int().nonnegative().describe("ID del primer segmento del clip"),
    endSegmentId: z.number().int().nonnegative().describe("ID del último segmento del clip (inclusive)"),
    topic: z.string().min(3).max(80).describe("Tema del clip en pocas palabras"),
    category: ClipCategorySchema,
    hookText: z
      .string()
      .min(3)
      .max(70)
      .describe("Texto en pantalla para los primeros 2-3 s; máximo ~8 palabras, sin hashtags"),
    rationale: z.string().min(10).max(300).describe("Por qué este fragmento retiene y aporta valor"),
    viralityScore: z.number().int().min(0).max(100),
    valueDensity: z.number().int().min(0).max(100).describe("Densidad de valor técnico/mindset por segundo"),
  })
  .refine((c) => c.endSegmentId >= c.startSegmentId, {
    message: "endSegmentId debe ser >= startSegmentId",
    path: ["endSegmentId"],
  });

export const MinerResponseSchema = z.object({
  clips: z.array(MinerCandidateSchema).max(12),
});

export type MinerCandidate = z.infer<typeof MinerCandidateSchema>;
export type MinerResponse = z.infer<typeof MinerResponseSchema>;

/** Clip final, listo para el Media Processor y el Copywriter. */
export const ClipSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  startTime: z.number().nonnegative(),
  endTime: z.number().positive(),
  duration: z.number().positive(),
  topic: z.string(),
  category: ClipCategorySchema,
  hookText: z.string(),
  rationale: z.string(),
  scores: z.object({
    virality: z.number(),
    valueDensity: z.number(),
    /** Ponderado usado para ordenar. */
    final: z.number(),
  }),
  segmentRange: z.tuple([z.number().int(), z.number().int()]),
  transcriptExcerpt: z.string(),
});
export type Clip = z.infer<typeof ClipSchema>;

export type DropReason = "unknown_segment" | "too_short" | "too_long" | "duplicate" | "low_score";
export interface DroppedCandidate {
  candidate: MinerCandidate;
  reason: DropReason;
  windowIndex: number;
}
