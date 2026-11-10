import type { StructuredLlm } from "../core/llm";
import type { Transcript } from "../schemas/transcript";

/** Transcripción sintética de 40 min (segmentos de 6 s) para demos sin API key. */
export function demoTranscript(): Transcript {
  return {
    sourceId: "demo-stream",
    language: "es",
    durationSec: 2400,
    segments: Array.from({ length: 400 }, (_, i) => ({
      id: i,
      start: i * 6,
      end: i * 6 + 5.8,
      text: `segmento de prueba ${i}`,
    })),
  };
}

/** LLM falso: propone clips válidos, uno corto, uno alucinado y uno de bajo score. */
export const demoLlm: StructuredLlm = {
  async generate(req) {
    const ids = [...req.prompt.matchAll(/^\[(\d+)\]/gm)].map((m) => Number(m[1]));
    const f = ids[0] ?? 0;
    const raw = {
      clips: [
        { startSegmentId: f + 10, endSegmentId: f + 16, topic: "Server Actions en Next", category: "tecnico", hookText: "Nadie te dice esto de Next", rationale: "Dato concreto con remate claro", viralityScore: 85, valueDensity: 80 },
        { startSegmentId: f + 30, endSegmentId: f + 31, topic: "Disciplina y gym", category: "mindset", hookText: "Llevaba un mes sin ir al gym", rationale: "Confesión que engancha", viralityScore: 75, valueDensity: 70 },
        { startSegmentId: 99999, endSegmentId: 100000, topic: "Clip alucinado", category: "opinion", hookText: "Esto no existe", rationale: "IDs fuera de rango", viralityScore: 90, valueDensity: 90 },
        { startSegmentId: f + 50, endSegmentId: f + 56, topic: "Relleno", category: "opinion", hookText: "Saludos al chat", rationale: "Poco valor real", viralityScore: 20, valueDensity: 10 },
      ],
    };
    return { data: req.schema.parse(raw), attempts: 1, usage: { inputTokens: 0, outputTokens: 0 }, model: "demo" };
  },
};
