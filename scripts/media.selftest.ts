/**
 * Prueba de la Fase 2 (motor de medios).
 *  - Unitarias puras: recorte 9:16, tiempos y escape ASS, chunks.
 *  - Integración real: genera un video 16:9 con FFmpeg y renderiza los 3 layouts.
 *   npx tsx scripts/media.selftest.ts
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildVideoFilter, centerCropRect, probeVideo, renderClip, type Layout } from "../src/engine/media";
import { assTime, buildAss, chunkWords, escapeAss, hexToAss, wordsInClip } from "../src/engine/media/subtitles";
import { runBinary, defaultBinaries } from "../src/engine/media/ffmpeg";
import { SubtitleStyleSchema } from "../src/engine/media/schemas";

async function main() {
  // --- puras -------------------------------------------------------------
  const r = centerCropRect({ width: 1920, height: 1080 }, { width: 1080, height: 1920 });
  assert.deepEqual(r, { x: 656, y: 0, w: 608, h: 1080 });
  const left = centerCropRect({ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, 0);
  assert.equal(left.x, 0);
  const right = centerCropRect({ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, 1);
  assert.equal(right.x + right.w, 1920);
  const odd = centerCropRect({ width: 1281, height: 721 }, { width: 1080, height: 1920 });
  assert.ok(odd.w % 2 === 0 && odd.h % 2 === 0 && odd.x + odd.w <= 1281 && odd.h <= 721);

  assert.equal(assTime(0), "0:00:00.00");
  assert.equal(assTime(83.456), "0:01:23.46");
  assert.equal(assTime(3725.1), "1:02:05.10");
  assert.equal(hexToAss("#FFD400"), "&H0000D4FF");
  assert.equal(escapeAss("hola {\\b1} mundo\n"), "hola (\\\\b1) mundo");

  const words = Array.from({ length: 20 }, (_, i) => ({ text: i === 6 ? "fin." : `w${i}`, start: 100 + i * 0.4, end: 100 + i * 0.4 + 0.35 }));
  const rel = wordsInClip(words, 101, 105);
  assert.ok(rel.every((w) => w.start >= 0 && w.end <= 4));
  const chunks = chunkWords(rel, 3, 0.6);
  assert.ok(chunks.every((c) => c.length <= 3));
  assert.ok(chunks.some((c) => c.at(-1)!.text === "fin."), "corta en fin de frase");

  const style = SubtitleStyleSchema.parse({});
  const ass = buildAss({ words, clipStart: 101, clipEnd: 105, style, width: 1080, height: 1920 });
  assert.match(ass, /PlayResY: 1920/);
  assert.match(ass, /Dialogue: 0,0:00:00\.\d\d,/);
  assert.ok(!/\{[^\\]/.test(ass.split("[Events]")[1]!.replace(/\{\\[^}]*\}/g, "")), "sin llaves sin escapar");

  const fc = buildVideoFilter({
    layout: { mode: "split", top: { x: 0.75, y: 0.7, w: 0.25, h: 0.3 }, bottom: { x: 0, y: 0, w: 0.75, h: 1 }, topRatio: 0.4 },
    probe: { width: 1920, height: 1080 },
    output: { width: 1080, height: 1920 },
    assFile: "c.ass",
  });
  assert.match(fc, /vstack=inputs=2/);
  assert.match(fc, /ass=c\.ass/);
  assert.match(fc, /\[v\]$/);
  console.log("unitarias OK ✔");

  // --- integración con FFmpeg real -----------------------------------------
  const dir = await mkdtemp(join(tmpdir(), "wso-media-"));
  const src = join(dir, "source.mp4");
  await runBinary(defaultBinaries().ffmpeg, [
    "-hide_banner", "-y",
    "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=12",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=12",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", src,
  ], { timeoutMs: 60_000 });

  const probe = await probeVideo(src);
  assert.equal(probe.width, 1920);
  assert.ok(probe.hasAudio);

  const layouts: Layout[] = [
    { mode: "center-crop", focusX: 0.5 },
    { mode: "blur-fill", blurRadius: 24 },
    { mode: "split", top: { x: 0.7, y: 0.65, w: 0.3, h: 0.35 }, bottom: { x: 0, y: 0, w: 0.7, h: 1 }, topRatio: 0.4 },
  ];
  const spokenWords = Array.from({ length: 30 }, (_, i) => ({ text: `palabra${i}`, start: i * 0.4, end: i * 0.4 + 0.35 }));

  for (const layout of layouts) {
    let lastProgress = 0;
    const res = await renderClip(
      {
        jobId: "selftest",
        sourcePath: src,
        clip: { id: `clip-${layout.mode}`, startTime: 2, endTime: 8 },
        words: spokenWords,
        layout,
        output: { preset: "ultrafast", crf: 28 },
        outDir: dir,
      },
      { probe, onProgress: (p) => (lastProgress = p) },
    );
    const out = await probeVideo(res.outputPath);
    assert.equal(out.width, 1080, `${layout.mode}: ancho`);
    assert.equal(out.height, 1920, `${layout.mode}: alto`);
    assert.ok(Math.abs(out.durationSec - 6) < 0.25, `${layout.mode}: duración ${out.durationSec}`);
    assert.ok(out.hasAudio, `${layout.mode}: audio`);
    assert.ok(res.assPath && (await readFile(res.assPath, "utf8")).includes("PALABRA5"));
    assert.ok(lastProgress > 0.9, `${layout.mode}: progreso ${lastProgress}`);
    console.log(`  ${layout.mode.padEnd(11)} → ${out.width}x${out.height} ${out.durationSec.toFixed(2)}s ${(res.bytes / 1024).toFixed(0)} KB en ${res.elapsedMs} ms`);
  }

  // idempotencia: segunda vez sale de caché
  const again = await renderClip({ jobId: "selftest", sourcePath: src, clip: { id: "clip-blur-fill", startTime: 2, endTime: 8 }, outDir: dir });
  assert.equal(again.cached, true);

  // errores tipados
  await assert.rejects(
    () => renderClip({ jobId: "selftest", sourcePath: src, clip: { id: "x", startTime: 50, endTime: 60 }, outDir: dir }, { probe }),
    (e: any) => e.code === "INPUT_INVALID",
  );
  await assert.rejects(() => probeVideo(join(dir, "no-existe.mp4")), (e: any) => e.code === "MEDIA_PROBE_FAILED");
  await assert.rejects(
    () => renderClip({ jobId: "selftest", sourcePath: src, clip: { id: "y", startTime: 0, endTime: 2 }, outDir: dir }, { bins: { ffmpeg: "ffmpeg-inexistente", ffprobe: "ffprobe" }, probe }),
    (e: any) => e.code === "MEDIA_BINARY_MISSING",
  );

  console.log(`integración OK ✔ (archivos en ${dir})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
