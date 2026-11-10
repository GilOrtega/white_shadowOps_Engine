/**
 * Prueba offline del Miner con un LLM falso (sin API key).
 *   npx tsx scripts/miner.selftest.ts
 */
import assert from "node:assert/strict";
import type { z } from "zod";
import { mineClips, type StructuredLlm, type Transcript } from "../src/engine";
import { buildWindows } from "../src/engine/agents/miner/windowing";

// Transcripción sintética: 40 min, segmentos de 6 s.
const segments = Array.from({ length: 400 }, (_, i) => ({
  id: i,
  start: i * 6,
  end: i * 6 + 5.8,
  text: `frase número ${i}`,
}));
const transcript: Transcript = { sourceId: "stream-001", language: "es", durationSec: 2400, segments };

let calls = 0;
const fake: StructuredLlm = {
  async generate(req) {
    calls++;
    const ids = [...req.prompt.matchAll(/^\[(\d+)\]/gm)].map((m) => Number(m[1]));
    const first = ids[0]!;
    const raw = {
      clips: [
        // válido (~42 s)
        { startSegmentId: first + 10, endSegmentId: first + 16, topic: "Server Actions", category: "tecnico", hookText: "Nadie te dice esto de Next", rationale: "Dato concreto con remate claro", viralityScore: 85, valueDensity: 80 },
        // demasiado corto: debe extenderse hasta >= 30 s
        { startSegmentId: first + 30, endSegmentId: first + 31, topic: "Disciplina", category: "mindset", hookText: "Llevaba un mes sin ir al gym", rationale: "Confesión que engancha", viralityScore: 75, valueDensity: 70 },
        // ID inventado fuera de la ventana: se descarta
        { startSegmentId: 99999, endSegmentId: 100000, topic: "Alucinado", category: "opinion", hookText: "Esto no existe", rationale: "IDs fuera de rango", viralityScore: 90, valueDensity: 90 },
        // score bajo
        { startSegmentId: first + 50, endSegmentId: first + 56, topic: "Relleno", category: "opinion", hookText: "Saludos al chat", rationale: "Poco valor real", viralityScore: 20, valueDensity: 10 },
      ],
    };
    const data = req.schema.parse(raw) as z.infer<typeof req.schema>;
    return { data, attempts: 1, usage: { inputTokens: 1000, outputTokens: 200 }, model: "fake" };
  },
};

async function main() {
  const windows = buildWindows(segments, 900, 90);
  assert.ok(windows.length >= 3, "debe haber varias ventanas");
  for (let i = 1; i < windows.length; i++) {
    assert.ok(windows[i]!.start < windows[i - 1]!.end, "ventanas deben traslaparse");
    assert.ok(windows[i]!.start > windows[i - 1]!.start, "ventanas deben avanzar");
  }
  assert.equal(windows.at(-1)!.segments.at(-1)!.id, 399, "la última ventana cubre el final");

  const res = await mineClips(fake, transcript, { context: "stream de prueba" });

  assert.equal(calls, windows.length);
  assert.equal(res.windowErrors.length, 0);
  for (const c of res.clips) {
    assert.ok(c.duration >= 30 && c.duration <= 60, `duración fuera de rango: ${c.duration}`);
    assert.ok(c.endTime > c.startTime);
  }
  for (let i = 1; i < res.clips.length; i++) {
    assert.ok(res.clips[i - 1]!.scores.final >= res.clips[i]!.scores.final, "ordenado por score");
  }
  const reasons = new Set(res.dropped.map((d) => d.reason));
  assert.ok(reasons.has("unknown_segment"));
  assert.ok(reasons.has("low_score"));
  assert.ok(res.clips.some((c) => c.topic === "Disciplina"), "el clip corto se extendió a >= 30 s");

  // Entrada inválida → INPUT_INVALID
  await assert.rejects(() => mineClips(fake, { sourceId: "x" }), (e: any) => e.code === "INPUT_INVALID");

  // IDs duplicados NO consecutivos → INPUT_INVALID
  const dup = { ...transcript, segments: [...segments.slice(0, 5), { ...segments[5]!, id: 1 }, ...segments.slice(6)] };
  await assert.rejects(() => mineClips(fake, dup), (e: any) => e.code === "INPUT_INVALID");

  console.log("OK ✔", { windows: windows.length, clips: res.clips.length, dropped: [...reasons] });
  console.table(res.clips.map((c) => ({ start: c.startTime, end: c.endTime, dur: c.duration, score: c.scores.final, topic: c.topic })));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
