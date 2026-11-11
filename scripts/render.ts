/**
 * Renderiza los clips que encontró el Miner.
 *   npx tsx scripts/render.ts <video.mp4> <transcript.json> <clips.json> [--layout blur-fill|center-crop|split] [--out ./renders] [--force]
 *
 * transcript.json: formato Transcript (con `words` por segmento para subtítulos).
 * clips.json:      salida de scripts/mine.ts, o el "Plan de render" que exporta el Estudio de shorts
 *                  (solo clips aprobados, con su gancho de 3 s y la altura de subtítulos que elegiste).
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { isEngineError, TranscriptSchema, type Clip } from "../src/engine";
import { probeVideo, renderClip, SubtitleStyleSchema, type Layout } from "../src/engine/media";

type PlanRender = Record<string, { hook?: string; hookSec?: number; marginV?: number }>;

const LAYOUTS: Record<string, Layout> = {
  "center-crop": { mode: "center-crop", focusX: 0.5 },
  "blur-fill": { mode: "blur-fill", blurRadius: 24 },
  // Facecam abajo-derecha en el stream original → arriba; pantalla → abajo. Ajusta a tu escena de OBS.
  split: { mode: "split", top: { x: 0.72, y: 0.68, w: 0.28, h: 0.32 }, bottom: { x: 0, y: 0, w: 0.72, h: 1 }, topRatio: 0.38 },
};

async function main() {
  const [video, transcriptFile, clipsFile, ...rest] = process.argv.slice(2);
  if (!video || !transcriptFile || !clipsFile) {
    console.error("Uso: tsx scripts/render.ts <video.mp4> <transcript.json> <clips.json> [--layout blur-fill] [--out ./renders]");
    process.exit(1);
  }
  const arg = (k: string) => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : undefined);
  const layout = LAYOUTS[arg("--layout") ?? "blur-fill"];
  if (!layout) throw new Error(`Layout desconocido. Opciones: ${Object.keys(LAYOUTS).join(", ")}`);
  const outDir = arg("--out") ?? "./renders";

  const transcript = TranscriptSchema.parse(JSON.parse(await readFile(transcriptFile, "utf8")));
  const file = JSON.parse(await readFile(clipsFile, "utf8")) as { kind?: string; clips: Clip[]; render?: PlanRender };
  const { clips } = file;
  const plan: PlanRender = file.kind === "wso.render-plan" ? file.render ?? {} : {};
  if (file.kind === "wso.render-plan") console.log(`Plan del Estudio: ${clips.length} clips aprobados (con gancho y subtítulos ajustados)`);
  const force = rest.includes("--force") || file.kind === "wso.render-plan";
  const words = transcript.segments.flatMap((s) => s.words ?? []);
  if (words.length === 0) console.warn("⚠ La transcripción no trae `words`: se renderiza sin subtítulos.");

  const ac = new AbortController();
  process.on("SIGINT", () => ac.abort());
  const probe = await probeVideo(video, undefined, ac.signal);
  console.log(`Original: ${probe.width}x${probe.height} ${probe.durationSec.toFixed(0)}s · ${clips.length} clips · layout ${layout.mode}`);

  const jobId = basename(video).replace(/\W+/g, "-").slice(0, 48);
  for (const [i, clip] of clips.entries()) {
    const res = await renderClip(
      {
        jobId, sourcePath: video, clip, words, layout, outDir, force,
        subtitles: SubtitleStyleSchema.parse({ ...(plan[clip.id]?.marginV !== undefined ? { marginV: plan[clip.id]!.marginV } : {}) }),
        hook: plan[clip.id]?.hook ? { text: plan[clip.id]!.hook!, durationSec: plan[clip.id]!.hookSec ?? 2.8 } : null,
      },
      { probe, signal: ac.signal, onProgress: (p) => process.stdout.write(`\r  [${i + 1}/${clips.length}] ${(p * 100).toFixed(0)}%   `) },
    );
    console.log(`\r  [${i + 1}/${clips.length}] ${res.cached ? "caché" : "ok"} → ${res.outputPath} (${(res.bytes / 1e6).toFixed(1)} MB)`);
  }
}

main().catch((err) => {
  console.error(isEngineError(err) ? `${err.code}: ${err.message}\n${err.details ?? ""}` : err);
  process.exit(1);
});
