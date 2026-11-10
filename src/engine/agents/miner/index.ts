import { createHash } from "node:crypto";
import { z } from "zod";
import { EngineError, isEngineError } from "../../core/errors";
import type { StructuredLlm } from "../../core/llm";
import {
  ClipSchema,
  MinerResponseSchema,
  type Clip,
  type DroppedCandidate,
  type MinerCandidate,
} from "../../schemas/clip";
import { TranscriptSchema, type Transcript, type TranscriptSegment } from "../../schemas/transcript";
import { buildMinerPrompt, MINER_SYSTEM_PROMPT } from "./prompt";
import { buildWindows, mapWithConcurrency, overlapRatio, type TranscriptWindow } from "./windowing";

export const MinerOptionsSchema = z.object({
  minDurationSec: z.number().positive().default(30),
  maxDurationSec: z.number().positive().default(60),
  /** Tamaño de ventana enviado al modelo. 15 min ≈ 2.5k palabras. */
  windowSec: z.number().positive().default(900),
  overlapSec: z.number().nonnegative().default(90),
  maxClipsPerWindow: z.number().int().min(1).max(12).default(4),
  maxClipsTotal: z.number().int().min(1).default(15),
  minFinalScore: z.number().min(0).max(100).default(55),
  /** Traslape (sobre el clip más corto) a partir del cual dos clips son el mismo. */
  dedupeOverlap: z.number().min(0).max(1).default(0.5),
  /** Colchón para no cortar la primera/última sílaba. */
  paddingSec: z.number().nonnegative().default(0.15),
  concurrency: z.number().int().min(1).max(8).default(3),
  /** Si una ventana falla, ¿se aborta todo o se sigue con las demás? */
  failFast: z.boolean().default(false),
  context: z.string().max(500).optional(),
  model: z.string().optional(),
});
export type MinerOptions = z.input<typeof MinerOptionsSchema>;

export interface MinerResult {
  sourceId: string;
  clips: Clip[];
  dropped: DroppedCandidate[];
  windowErrors: { windowIndex: number; code: string; message: string }[];
  stats: {
    windows: number;
    candidates: number;
    llmAttempts: number;
    inputTokens: number;
    outputTokens: number;
    elapsedMs: number;
  };
}

/** score final = 60% viralidad + 40% densidad de valor. */
const finalScore = (c: MinerCandidate) => Math.round(c.viralityScore * 0.6 + c.valueDensity * 0.4);

/**
 * Convierte el rango de segmentos elegido por el modelo en tiempos reales
 * y lo ajusta a [min, max] agregando/quitando segmentos completos al final
 * (nunca corta a media frase).
 */
function resolveCandidate(
  c: MinerCandidate,
  segments: TranscriptSegment[],
  indexById: Map<number, number>,
  opts: z.infer<typeof MinerOptionsSchema>,
  durationSec: number,
): { ok: true; startIdx: number; endIdx: number } | { ok: false; reason: DroppedCandidate["reason"] } {
  const startIdx = indexById.get(c.startSegmentId);
  let endIdx = indexById.get(c.endSegmentId);
  if (startIdx === undefined || endIdx === undefined || endIdx < startIdx) {
    return { ok: false, reason: "unknown_segment" };
  }

  const dur = (e: number) =>
    Math.min(durationSec, segments[e]!.end + opts.paddingSec) - Math.max(0, segments[startIdx]!.start - opts.paddingSec);

  while (dur(endIdx) < opts.minDurationSec && endIdx + 1 < segments.length && dur(endIdx + 1) <= opts.maxDurationSec) {
    endIdx++;
  }
  while (dur(endIdx) > opts.maxDurationSec && endIdx > startIdx) endIdx--;

  const d = dur(endIdx);
  if (d < opts.minDurationSec) return { ok: false, reason: "too_short" };
  if (d > opts.maxDurationSec) return { ok: false, reason: "too_long" };
  return { ok: true, startIdx, endIdx };
}

const clipId = (sourceId: string, start: number, end: number) =>
  createHash("sha1").update(`${sourceId}:${start.toFixed(2)}:${end.toFixed(2)}`).digest("hex").slice(0, 12);

/**
 * Agente Content Miner.
 * Entrada: transcripción normalizada. Salida: clips 30–60 s ordenados por score,
 * deduplicados entre ventanas, con timestamps derivados de la transcripción.
 */
export async function mineClips(
  llm: StructuredLlm,
  transcriptInput: unknown,
  options: MinerOptions = {},
  signal?: AbortSignal,
): Promise<MinerResult> {
  const t0 = Date.now();

  const transcriptParsed = TranscriptSchema.safeParse(transcriptInput);
  if (!transcriptParsed.success) {
    throw new EngineError("INPUT_INVALID", z.prettifyError(transcriptParsed.error));
  }
  const optsParsed = MinerOptionsSchema.safeParse(options);
  if (!optsParsed.success) throw new EngineError("INPUT_INVALID", z.prettifyError(optsParsed.error));

  const transcript: Transcript = transcriptParsed.data;
  const opts = optsParsed.data;
  if (opts.minDurationSec >= opts.maxDurationSec) {
    throw new EngineError("INPUT_INVALID", "minDurationSec debe ser menor que maxDurationSec");
  }
  if (opts.windowSec < opts.maxDurationSec * 2) {
    throw new EngineError("INPUT_INVALID", "windowSec debe ser al menos el doble de maxDurationSec");
  }

  const segments = transcript.segments.filter((s) => s.text.trim().length > 0);
  const indexById = new Map(segments.map((s, i) => [s.id, i]));
  const windows = buildWindows(segments, opts.windowSec, opts.overlapSec);

  const stats = { windows: windows.length, candidates: 0, llmAttempts: 0, inputTokens: 0, outputTokens: 0, elapsedMs: 0 };
  const windowErrors: MinerResult["windowErrors"] = [];
  const dropped: DroppedCandidate[] = [];

  const runWindow = async (w: TranscriptWindow) => {
    try {
      const res = await llm.generate({
        system: MINER_SYSTEM_PROMPT,
        prompt: buildMinerPrompt({
          segments: w.segments,
          windowIndex: w.index,
          windowCount: windows.length,
          maxClips: opts.maxClipsPerWindow,
          minDurationSec: opts.minDurationSec,
          maxDurationSec: opts.maxDurationSec,
          context: opts.context,
        }),
        schema: MinerResponseSchema,
        schemaName: "report_clips",
        schemaDescription: "Reporta los clips virales encontrados en esta ventana de la transcripción.",
        model: opts.model,
        maxTokens: 2500,
        effort: "medium",
        signal,
      });
      stats.llmAttempts += res.attempts;
      stats.inputTokens += res.usage.inputTokens;
      stats.outputTokens += res.usage.outputTokens;

      // El modelo solo puede usar IDs de SU ventana.
      const allowed = new Set(w.segments.map((s) => s.id));
      return res.data.clips.slice(0, opts.maxClipsPerWindow).map((c) => ({ c, windowIndex: w.index, allowed }));
    } catch (err) {
      if (opts.failFast || (isEngineError(err) && err.code === "ABORTED")) throw err;
      windowErrors.push({
        windowIndex: w.index,
        code: isEngineError(err) ? err.code : "UNKNOWN",
        message: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  };

  const perWindow = await mapWithConcurrency(windows, opts.concurrency, runWindow);

  if (windows.length > 0 && windowErrors.length === windows.length) {
    throw new EngineError("LLM_REQUEST_FAILED", "Fallaron todas las ventanas del Miner", {
      retryable: true,
      details: windowErrors,
    });
  }

  // 1) Resolver timestamps
  const resolved: Clip[] = [];
  for (const { c, windowIndex, allowed } of perWindow.flat()) {
    stats.candidates++;
    if (!allowed.has(c.startSegmentId) || !allowed.has(c.endSegmentId)) {
      dropped.push({ candidate: c, reason: "unknown_segment", windowIndex });
      continue;
    }
    const r = resolveCandidate(c, segments, indexById, opts, transcript.durationSec);
    if (!r.ok) {
      dropped.push({ candidate: c, reason: r.reason, windowIndex });
      continue;
    }
    const first = segments[r.startIdx]!;
    const last = segments[r.endIdx]!;
    const startTime = Math.max(0, first.start - opts.paddingSec);
    const endTime = Math.min(transcript.durationSec, last.end + opts.paddingSec);
    const score = finalScore(c);
    if (score < opts.minFinalScore) {
      dropped.push({ candidate: c, reason: "low_score", windowIndex });
      continue;
    }
    resolved.push({
      id: clipId(transcript.sourceId, startTime, endTime),
      sourceId: transcript.sourceId,
      startTime: round2(startTime),
      endTime: round2(endTime),
      duration: round2(endTime - startTime),
      topic: c.topic,
      category: c.category,
      hookText: c.hookText,
      rationale: c.rationale,
      scores: { virality: c.viralityScore, valueDensity: c.valueDensity, final: score },
      segmentRange: [first.id, last.id],
      transcriptExcerpt: segments
        .slice(r.startIdx, r.endIdx + 1)
        .map((s) => s.text.trim())
        .join(" "),
    });
  }

  // 2) Dedupe (NMS temporal): gana el de mayor score
  resolved.sort((a, b) => b.scores.final - a.scores.final);
  const kept: Clip[] = [];
  for (const clip of resolved) {
    if (kept.some((k) => overlapRatio(k, clip) >= opts.dedupeOverlap)) {
      dropped.push({
        candidate: {
          startSegmentId: clip.segmentRange[0],
          endSegmentId: clip.segmentRange[1],
          topic: clip.topic,
          category: clip.category,
          hookText: clip.hookText,
          rationale: clip.rationale,
          viralityScore: clip.scores.virality,
          valueDensity: clip.scores.valueDensity,
        },
        reason: "duplicate",
        windowIndex: -1,
      });
      continue;
    }
    kept.push(clip);
    if (kept.length >= opts.maxClipsTotal) break;
  }

  // 3) Contrato de salida: si esto falla es un bug nuestro, no del modelo.
  const contract = ClipSchema.array().safeParse(kept);
  if (!contract.success) {
    throw new EngineError("INTERNAL_CONTRACT", z.prettifyError(contract.error));
  }

  stats.elapsedMs = Date.now() - t0;
  return { sourceId: transcript.sourceId, clips: kept, dropped, windowErrors, stats };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
