import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { EngineError } from "../core/errors";
import { TranscriptSchema, type Transcript, type TranscriptSegment, type Word } from "../schemas/transcript";

/**
 * Ingesta con Deepgram (REST, sin SDK). Normaliza la respuesta al formato
 * `Transcript` que consume el Miner y el motor de subtítulos.
 */

export const DeepgramOptionsSchema = z.object({
  model: z.string().default("nova-3"),
  /** "es" para streams en español; "multi" si mezclas mucho inglés técnico. */
  language: z.string().default("es"),
  /** Términos que Deepgram debe reconocer bien (nova-3 keyterm prompting). */
  keyterms: z.array(z.string().min(1).max(60)).max(50).default([]),
  diarize: z.boolean().default(false),
  /** Segmentos para el Miner: corte por pausa o por longitud máxima. */
  maxSegmentSec: z.number().min(3).max(60).default(12),
  segmentGapSec: z.number().min(0.2).max(5).default(0.8),
  timeoutMs: z.number().int().positive().default(15 * 60_000),
});
export type DeepgramOptions = z.input<typeof DeepgramOptionsSchema>;

const DgWordSchema = z
  .object({
    word: z.string(),
    start: z.number(),
    end: z.number(),
    confidence: z.number().optional(),
    punctuated_word: z.string().optional(),
    speaker: z.number().optional(),
  })
  .loose();

export const DeepgramResponseSchema = z
  .object({
    metadata: z.object({ request_id: z.string().optional(), duration: z.number().optional() }).loose(),
    results: z
      .object({
        channels: z
          .array(
            z
              .object({
                alternatives: z.array(z.object({ transcript: z.string(), words: z.array(DgWordSchema) }).loose()).min(1),
                detected_language: z.string().optional(),
              })
              .loose(),
          )
          .min(1),
      })
      .loose(),
  })
  .loose();
export type DeepgramResponse = z.infer<typeof DeepgramResponseSchema>;

/** Agrupa palabras en segmentos: corta en pausas, fin de frase o longitud máxima. */
export function segmentWords(words: (Word & { speaker?: number })[], maxSegmentSec: number, gapSec: number): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let cur: (Word & { speaker?: number })[] = [];

  const flush = () => {
    if (!cur.length) return;
    const first = cur[0]!;
    const last = cur.at(-1)!;
    segments.push({
      id: segments.length,
      start: first.start,
      end: Math.max(last.end, first.start),
      text: cur.map((w) => w.text).join(" "),
      ...(first.speaker !== undefined ? { speaker: `S${first.speaker}` } : {}),
      words: cur.map(({ text, start, end, confidence }) => ({ text, start, end, ...(confidence !== undefined ? { confidence } : {}) })),
    });
    cur = [];
  };

  for (const w of words) {
    const prev = cur.at(-1);
    if (prev) {
      const gap = w.start - prev.end;
      const tooLong = w.end - cur[0]!.start > maxSegmentSec;
      const speakerChange = w.speaker !== undefined && w.speaker !== prev.speaker;
      // Fin de frase: cortamos si ya hay algo de contenido (evita segmentos de 1 palabra).
      const sentenceEnd = /[.!?…]$/.test(prev.text) && prev.end - cur[0]!.start > 3;
      if (gap > gapSec || tooLong || speakerChange || sentenceEnd) flush();
    }
    cur.push(w);
  }
  flush();
  return segments;
}

/** Convierte la respuesta de Deepgram en un Transcript validado. */
export function deepgramToTranscript(raw: unknown, sourceId: string, opts: DeepgramOptions = {}): Transcript {
  const o = DeepgramOptionsSchema.parse(opts);
  const parsed = DeepgramResponseSchema.safeParse(raw);
  if (!parsed.success) throw new EngineError("TRANSCRIPTION_FAILED", `Respuesta de Deepgram inesperada: ${z.prettifyError(parsed.error)}`);

  const ch = parsed.data.results.channels[0]!;
  const alt = ch.alternatives[0]!;
  const words = alt.words
    .filter((w) => w.end >= w.start && (w.punctuated_word ?? w.word).trim())
    .map((w) => ({
      text: (w.punctuated_word ?? w.word).trim(),
      start: w.start,
      end: w.end,
      ...(w.confidence !== undefined ? { confidence: Math.min(1, Math.max(0, w.confidence)) } : {}),
      ...(w.speaker !== undefined ? { speaker: w.speaker } : {}),
    }));

  if (words.length === 0) {
    throw new EngineError("TRANSCRIPTION_FAILED", "Deepgram no detectó voz en el audio");
  }

  const durationSec = parsed.data.metadata.duration ?? words.at(-1)!.end;
  const transcript = {
    sourceId,
    language: ch.detected_language ?? o.language,
    durationSec: Math.max(durationSec, words.at(-1)!.end),
    segments: segmentWords(words, o.maxSegmentSec, o.segmentGapSec),
  };

  const check = TranscriptSchema.safeParse(transcript);
  if (!check.success) throw new EngineError("INTERNAL_CONTRACT", z.prettifyError(check.error));
  return check.data;
}

export function buildListenUrl(o: z.infer<typeof DeepgramOptionsSchema>, callbackUrl?: string): string {
  const q = new URLSearchParams({
    model: o.model,
    language: o.language,
    smart_format: "true",
    punctuate: "true",
    diarize: String(o.diarize),
  });
  for (const k of o.keyterms) q.append("keyterm", k);
  if (callbackUrl) q.set("callback", callbackUrl);
  return `https://api.deepgram.com/v1/listen?${q}`;
}

export interface Transcriber {
  transcribeFile(audioPath: string, sourceId: string, signal?: AbortSignal): Promise<Transcript>;
}

/** Transcriptor síncrono (CLI / worker). Para Vercel usar `requestAsync` con callback. */
export class DeepgramTranscriber implements Transcriber {
  private readonly opts: z.infer<typeof DeepgramOptionsSchema>;

  constructor(
    private readonly apiKey: string = process.env.DEEPGRAM_API_KEY ?? "",
    opts: DeepgramOptions = {},
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new EngineError("CONFIG_INVALID", "DEEPGRAM_API_KEY es requerida");
    this.opts = DeepgramOptionsSchema.parse(opts);
  }

  async transcribeFile(audioPath: string, sourceId: string, signal?: AbortSignal): Promise<Transcript> {
    const size = (await stat(audioPath)).size;
    if (size > 2 * 1024 ** 3) throw new EngineError("INPUT_INVALID", "Audio > 2 GB: súbelo a storage y usa transcribeUrl");
    const body = await readFile(audioPath);
    const raw = await this.post(buildListenUrl(this.opts), body, "audio/mpeg", signal);
    return deepgramToTranscript(raw, sourceId, this.opts);
  }

  async transcribeUrl(url: string, sourceId: string, signal?: AbortSignal): Promise<Transcript> {
    const raw = await this.post(buildListenUrl(this.opts), JSON.stringify({ url }), "application/json", signal);
    return deepgramToTranscript(raw, sourceId, this.opts);
  }

  /** Modo asíncrono: Deepgram responde de inmediato con request_id y luego hace POST a callbackUrl. */
  async requestAsync(url: string, callbackUrl: string, signal?: AbortSignal): Promise<{ requestId: string }> {
    const raw = await this.post(buildListenUrl(this.opts, callbackUrl), JSON.stringify({ url }), "application/json", signal);
    const id = z.object({ request_id: z.string() }).safeParse(raw);
    if (!id.success) throw new EngineError("TRANSCRIPTION_FAILED", "Deepgram no regresó request_id");
    return { requestId: id.data.request_id };
  }

  private async post(url: string, body: BodyInit, contentType: string, signal?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.opts.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Token ${this.apiKey}`, "Content-Type": contentType },
        body,
        signal: combined,
      });
    } catch (cause) {
      if (signal?.aborted) throw new EngineError("ABORTED", "Operación cancelada", { cause });
      if (timeout.aborted) throw new EngineError("TRANSCRIPTION_FAILED", "Deepgram excedió el timeout", { retryable: true, cause });
      throw new EngineError("TRANSCRIPTION_FAILED", "No se pudo conectar con Deepgram", { retryable: true, cause });
    }
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 500);
      throw new EngineError("TRANSCRIPTION_FAILED", `Deepgram respondió ${res.status}: ${text}`, {
        retryable: res.status === 429 || res.status >= 500,
      });
    }
    return res.json();
  }
}
