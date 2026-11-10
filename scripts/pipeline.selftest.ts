/**
 * Prueba de punta a punta OFFLINE de la Fase 3: video real (FFmpeg) + Deepgram simulado
 * (misma forma de respuesta que la API) + Claude simulado + render real.
 *   npx tsx scripts/pipeline.selftest.ts
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StructuredLlm } from "../src/engine";
import { buildListenUrl, deepgramToTranscript, DeepgramOptionsSchema, DeepgramTranscriber, segmentWords } from "../src/engine/ingest/deepgram";
import { defaultBinaries, probeVideo, runBinary } from "../src/engine/media/ffmpeg";
import { runLocalPipeline, type PipelineEvent } from "../src/engine/pipeline/local";

const DURATION = 150;

/** Respuesta con la forma real de Deepgram /v1/listen. */
function fakeDeepgramResponse() {
  const words = [];
  for (let i = 0; i * 0.4 < DURATION - 1; i++) {
    const w = `palabra${i}`;
    words.push({ word: w, start: i * 0.4, end: i * 0.4 + 0.33, confidence: 0.98, punctuated_word: i % 12 === 11 ? `${w}.` : w });
  }
  return {
    metadata: { request_id: "req-123", duration: DURATION },
    results: { channels: [{ alternatives: [{ transcript: words.map((w) => w.punctuated_word).join(" "), confidence: 0.97, words }] }] },
  };
}

async function main() {
  // --- unitarias de ingesta ---
  const t = deepgramToTranscript(fakeDeepgramResponse(), "src-1");
  assert.equal(t.durationSec, DURATION);
  assert.ok(t.segments.length > 10);
  assert.ok(t.segments.every((s) => s.end - s.start <= 12.5), "segmentos ≤ maxSegmentSec");
  assert.ok(t.segments.every((s, i) => s.id === i));
  assert.ok(t.segments[0]!.words![0]!.text === "palabra0");

  const gapSplit = segmentWords(
    [{ text: "a", start: 0, end: 0.3 }, { text: "b", start: 0.4, end: 0.7 }, { text: "c", start: 3, end: 3.3 }],
    12, 0.8,
  );
  assert.equal(gapSplit.length, 2, "corta por pausa");

  const url = new URL(buildListenUrl(DeepgramOptionsSchema.parse({ keyterms: ["Next.js", "Vercel"] }), "https://x.app/cb?token=abc"));
  assert.equal(url.searchParams.get("model"), "nova-3");
  assert.equal(url.searchParams.get("language"), "es");
  assert.deepEqual(url.searchParams.getAll("keyterm"), ["Next.js", "Vercel"]);
  assert.equal(url.searchParams.get("callback"), "https://x.app/cb?token=abc");

  assert.throws(() => deepgramToTranscript({ metadata: {}, results: { channels: [{ alternatives: [{ transcript: "", words: [] }] }] } }, "x"), (e: any) => e.code === "TRANSCRIPTION_FAILED");
  assert.throws(() => deepgramToTranscript({ nada: true }, "x"), (e: any) => e.code === "TRANSCRIPTION_FAILED");

  // Errores HTTP tipados (fetch simulado)
  const err401 = new DeepgramTranscriber("k", {}, (async () => new Response("bad key", { status: 401 })) as typeof fetch);
  await assert.rejects(() => err401.transcribeUrl("https://a/b.mp3", "x"), (e: any) => e.code === "TRANSCRIPTION_FAILED" && !e.retryable);
  const err503 = new DeepgramTranscriber("k", {}, (async () => new Response("down", { status: 503 })) as typeof fetch);
  await assert.rejects(() => err503.transcribeUrl("https://a/b.mp3", "x"), (e: any) => e.retryable === true);
  console.log("ingesta OK ✔");

  // --- punta a punta ---
  const dir = await mkdtemp(join(tmpdir(), "wso-pipe-"));
  const video = join(dir, "Mi Stream #12 (final).mp4");
  await runBinary(defaultBinaries().ffmpeg, [
    "-hide_banner", "-y", "-f", "lavfi", "-i", `testsrc2=size=1280x720:rate=30:duration=${DURATION}`,
    "-f", "lavfi", "-i", `sine=frequency=330:duration=${DURATION}`,
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", video,
  ], { timeoutMs: 120_000 });

  let dgCalls = 0;
  let sentContentType = "";
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    dgCalls++;
    sentContentType = new Headers(init.headers).get("content-type") ?? "";
    assert.ok((init.body as Buffer).length > 10_000, "se envió el audio");
    return Response.json(fakeDeepgramResponse());
  }) as typeof fetch;

  let llmCalls = 0;
  const fakeLlm: StructuredLlm = {
    async generate(req) {
      llmCalls++;
      const ids = [...req.prompt.matchAll(/^\[(\d+)\]/gm)].map((m) => Number(m[1]));
      const data = req.schema.parse({
        clips: [
          { startSegmentId: ids[1]!, endSegmentId: ids[4]!, topic: "Arquitectura", category: "tecnico", hookText: "Así se arma un pipeline de IA", rationale: "Explicación concreta con cierre", viralityScore: 82, valueDensity: 78 },
          { startSegmentId: ids[6]!, endSegmentId: ids[8]!, topic: "Disciplina", category: "mindset", hookText: "Nadie viene a salvarte", rationale: "Frase fuerte de mindset", viralityScore: 76, valueDensity: 70 },
        ],
      });
      return { data, attempts: 1, usage: { inputTokens: 0, outputTokens: 0 }, model: "fake" };
    },
  };

  const events: PipelineEvent[] = [];
  const deps = { transcriber: new DeepgramTranscriber("test-key", {}, fakeFetch), llm: fakeLlm, onEvent: (e: PipelineEvent) => events.push(e) };
  const input = { videoPath: video, outDir: join(dir, "out"), layout: { mode: "blur-fill", blurRadius: 24 } as const, context: "prueba" };

  const res = await runLocalPipeline(input, deps);
  assert.equal(res.jobId, "Mi-Stream-12-final");
  assert.equal(sentContentType, "audio/mpeg");
  assert.equal(res.renders.length, 2);
  for (const r of res.renders) {
    const p = await probeVideo(r.outputPath);
    assert.equal(`${p.width}x${p.height}`, "1080x1920");
    assert.ok(p.durationSec >= 29.5 && p.durationSec <= 60.5, `duración ${p.durationSec}`);
    assert.ok(p.hasAudio);
  }
  const result = JSON.parse(await readFile(join(res.jobDir, "result.json"), "utf8"));
  assert.equal(result.clips.length, 2);
  console.log(`  1ª corrida: ${res.renders.map((r) => `${r.durationSec.toFixed(1)}s`).join(", ")} · Deepgram ${dgCalls} · Claude ${llmCalls}`);

  // Reanudable: segunda corrida NO vuelve a llamar APIs ni a renderizar
  events.length = 0;
  const again = await runLocalPipeline(input, deps);
  assert.equal(dgCalls, 1, "no re-transcribe");
  assert.equal(llmCalls, 1, "no re-mina");
  assert.ok(again.renders.every((r) => r.cached), "no re-renderiza");
  assert.deepEqual(events.filter((e) => e.type === "step" && e.status === "cached").map((e) => (e as any).step), ["audio", "transcribe", "mine"]);
  console.log("  2ª corrida: todo desde caché ✔");

  await assert.rejects(() => runLocalPipeline({ ...input, videoPath: join(dir, "nope.mp4") }, deps), (e: any) => e.code === "INPUT_INVALID");
  console.log(`pipeline OK ✔ (${res.jobDir})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
