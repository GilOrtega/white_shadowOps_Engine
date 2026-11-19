/** Pruebas del Clipper de streams.  npx tsx scripts/clipper.selftest.ts
 *  Con ffmpeg: arma un "stream" sintético (callado → grito → callado), corre el pipeline completo
 *  con Whisper y Claude simulados, y revisa volumen, gancho y la revisión PASS/WARN/FAIL. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { intensity, loudHotspots, parseQa, parseRms, reviewClip } from "../src/engine/clipper/analysis";
import type { StructuredLlm } from "../src/engine/core/llm";
import type { Transcriber } from "../src/engine/ingest/deepgram";
import { runLocalPipeline } from "../src/engine/pipeline/local";
import { TranscriptSchema } from "../src/engine/schemas/transcript";
import { StreamClipSchema, ShortJobSchema } from "../src/engine/shorts/plan";
import { layoutFor } from "./clipper";

// Volumen
assert.deepEqual(parseRms("frame:0\nlavfi.astats.Overall.RMS_level=-30.5\nframe:1\nlavfi.astats.Overall.RMS_level=-inf\n"), [-30.5, -90]);
const rms = [...Array(100).fill(-35), -12, -14, ...Array(50).fill(-35), -10, ...Array(48).fill(-36)];
assert.deepEqual(loudHotspots(rms), [100, 152], "los dos gritos, separados");
assert.deepEqual(loudHotspots(rms, { gapSec: 60 }), [152], "si están cerca, solo el más fuerte");
assert.equal(intensity(rms, 95, 110), 23);
assert.equal(intensity(rms, 0, 50), 0);

// Revisión
assert.deepEqual(parseQa("[silencedetect] silence_duration: 1.5\n[blackdetect] black_start:0 black_end:2 black_duration:2\nsilence_duration: 0.5"), { silenceSec: 2, blackSec: 2 });
assert.equal(reviewClip({ durationSec: 30, silenceSec: 2, blackSec: 0, words: 60 }).level, "pass");
assert.equal(reviewClip({ durationSec: 30, silenceSec: 9, blackSec: 0, words: 60 }).level, "warn");
assert.equal(reviewClip({ durationSec: 30, silenceSec: 15, blackSec: 0, words: 60 }).level, "fail");
assert.equal(reviewClip({ durationSec: 30, silenceSec: 0, blackSec: 20, words: 60 }).level, "fail", "HDCP / negro");
assert.equal(reviewClip({ durationSec: 5, silenceSec: 0, blackSec: 0, words: 10 }).level, "fail");
assert.deepEqual(reviewClip({ durationSec: 30, silenceSec: 0, blackSec: 0, words: 0 }).notes, ["Sin voz: solo juego"]);

// Cámara
assert.equal(layoutFor(undefined).mode, "blur-fill");
const split = layoutFor("0.72,0.68,0.28,0.32");
assert.ok(split.mode === "split" && split.top.x === 0.72);
assert.throws(() => layoutFor("0.9,0,0.5,0.5"), /inválido/);

// Registro de clip de stream
assert.ok(StreamClipSchema.safeParse({ result: { url: "https://x.y/a.mp4", pathname: "shorts/out/a.mp4", durationSec: 30 }, qa: { level: "warn", notes: ["Silencio 30%"] } }).success);
assert.equal(ShortJobSchema.parse({ id: "abcdef1", createdAt: "x", updatedAt: "x", status: "ready", clips: [{ url: "https://x.y/a.mp4", pathname: "p" }] }).source, "dia", "trabajos viejos siguen cargando");

const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();

async function e2e() {
  const dir = mkdtempSync(join(tmpdir(), "clipper-"));
  const video = join(dir, "stream.mp4");
  // 60 s: juego 1280x720 + audio bajito, con un "grito" (tono fuerte) de 30 a 33 s.
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24:duration=60",
    "-f", "lavfi", "-i", "sine=frequency=300:duration=60", "-filter_complex", "[1:a]volume='if(between(t,30,33),1.0,0.12)':eval=frame[a]",
    "-map", "0:v", "-map", "[a]", "-pix_fmt", "yuv420p", "-c:a", "aac", video]);
  const transcriber: Transcriber = {
    async transcribeFile(_a, sourceId) {
      const segs = Array.from({ length: 12 }, (_, i) => ({ id: i, start: i * 5, end: i * 5 + 4.5, text: `frase ${i}`, words: [{ text: `palabra${i}`, start: i * 5, end: i * 5 + 1 }, { text: "otra", start: i * 5 + 1.2, end: i * 5 + 2 }] }));
      return TranscriptSchema.parse({ sourceId, durationSec: 60, segments: segs });
    },
  };
  let sawHot = false;
  const llm: StructuredLlm = {
    async generate(req) {
      sawHot ||= /Momentos de volumen alto en esta ventana: 00:3[0-3]/.test(req.prompt) && /Clip Miner/.test(req.system);
      return { data: { clips: [{ startSegmentId: 5, endSegmentId: 7, topic: "el grito", category: "reaccion", hookText: "No me lo esperaba", rationale: "reacción fuerte con remate", viralityScore: 70, valueDensity: 70 }] } as never, attempts: 1, usage: { inputTokens: 1, outputTokens: 1 }, model: "fake" };
    },
  };
  const res = await runLocalPipeline(
    { videoPath: video, outDir: dir, layout: layoutFor("0.72,0.68,0.28,0.32"), loudness: true, qa: true, maxClips: 3,
      miner: { profile: "gaming", minDurationSec: 10, maxDurationSec: 45, windowSec: 600, overlapSec: 60 } },
    { transcriber, llm },
  );
  assert.ok(sawHot, "Claude recibe el momento del grito y el prompt de gaming");
  assert.equal(res.renders.length, 1);
  assert.ok(res.miner.clips[0]!.scores.final > 70, "el grito sube el puntaje");
  assert.equal(res.qa.length, 1);
  assert.ok(["pass", "warn"].includes(res.qa[0]!.level), `revisión: ${res.qa[0]!.level} ${res.qa[0]!.notes}`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1", "-i", res.renders[0]!.outputPath, "-frames:v", "1", join(tmpdir(), "clipper-preview.jpg")]);
  console.log("  pipeline real OK:", res.qa[0]!.level, res.qa[0]!.notes.join(", ") || "sin notas");
}

(async () => {
  if (hasFfmpeg) await e2e();
  else console.log("  (sin ffmpeg: se salta el pipeline real)");
  console.log("clipper OK ✔");
})();
