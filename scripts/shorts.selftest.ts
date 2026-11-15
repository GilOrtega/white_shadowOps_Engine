/** Pruebas del motor de Shorts (fase "clips del día").  npx tsx scripts/shorts.selftest.ts
 *  Con ffmpeg instalado también arma un Short de verdad con clips sintéticos. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeVideo } from "../src/engine/media/ffmpeg";
import { SubtitleStyleSchema } from "../src/engine/media/schemas";
import { buildAss } from "../src/engine/media/subtitles";
import * as P from "../src/engine/shorts/plan";

// Palabras de varios clips en una sola línea de tiempo
const m = P.mergeWords([
  { words: [{ text: "hola", start: 0.2, end: 0.6 }, { text: "fuera", start: 3.5, end: 4 }], durationSec: 3 },
  { words: [{ text: "día", start: 0.1, end: 0.4 }], durationSec: 2 },
]);
assert.equal(m.durationSec, 5);
assert.deepEqual(m.words.map((w) => [w.text, w.start]), [["hola", 0.2], ["día", 3.1]], "se descarta lo que pasa del final del clip");

assert.equal(P.badgeFor(3, 60), "DÍA 3 DE 60");
assert.equal(P.badgeFor(0, 60), "");
assert.equal(P.concatList(["/a/b.mp4", "/a/it's.mp4"]), "file '/a/b.mp4'\nfile '/a/it'\\''s.mp4'\n");
assert.ok(P.isActive("queued") && P.isActive("rendering") && !P.isActive("ready"));
assert.match(P.newJobId(), /^[a-z0-9]{6,24}$/);
assert.equal(P.NewShortSchema.safeParse({ clips: [] }).success, false, "al menos un clip");
assert.equal(P.NewShortSchema.safeParse({ clips: Array.from({ length: 7 }, () => ({ url: "https://x.y/a.mp4", pathname: "shorts/raw/a.mp4" })) }).success, false, "máximo 6");

const ass = buildAss({ words: m.words, clipStart: 0, clipEnd: 5, style: SubtitleStyleSchema.parse({}), width: 1080, height: 1920, hook: { text: "Día 1 otra vez", durationSec: 2.8 }, badge: "DÍA 1 DE 60" });
assert.match(ass, /Style: Badge/);
assert.match(ass, /Badge,,0,0,0,,DÍA 1 DE 60/);
assert.match(ass, /Hook,,0,0,0,,Día 1 otra vez/);

const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();

async function realRender() {
  const dir = mkdtempSync(join(tmpdir(), "short-"));
  const mk = (name: string, size: string, audio: boolean) => {
    const out = join(dir, name);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=24:duration=2`,
      ...(audio ? ["-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-shortest"] : []), "-pix_fmt", "yuv420p", out]);
    return out;
  };
  const clips = [mk("v.mp4", "720x1280", true), mk("h.mp4", "1280x720", true), mk("mute.mp4", "640x640", false)];
  const norm: string[] = [];
  for (const [i, c] of clips.entries()) {
    const p = await probeVideo(c);
    const out = join(dir, `n${i}.mp4`);
    execFileSync("ffmpeg", P.normalizeArgs(c, out, { hasAudio: p.hasAudio, vertical: p.height >= p.width }));
    const q = await probeVideo(out);
    assert.deepEqual([q.width, q.height, q.hasAudio], [1080, 1920, true], `clip ${i} en vertical y con audio`);
    norm.push(out);
  }
  const assFile = join(dir, "s.ass");
  writeFileSync(assFile, ass);
  const list = join(dir, "list.txt");
  writeFileSync(list, P.concatList(norm));
  const final = join(dir, "short.mp4");
  execFileSync("ffmpeg", P.finalArgs(list, assFile, final));
  const f = await probeVideo(final);
  assert.deepEqual([f.width, f.height, f.hasAudio], [1080, 1920, true]);
  assert.ok(Math.abs(f.durationSec - 6) < 0.6, `dura ~6 s (${f.durationSec})`);
  assert.ok(statSync(final).size > 10_000);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0.5", "-i", final, "-frames:v", "1", join(tmpdir(), "short-preview.jpg")]);
  console.log("  render real OK:", f.durationSec.toFixed(1), "s");
}

(async () => {
  if (hasFfmpeg) await realRender();
  else console.log("  (sin ffmpeg: se salta el render real)");
  console.log("shorts OK ✔");
})();
