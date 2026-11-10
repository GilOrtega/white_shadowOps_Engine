/**
 * Pipeline completo en tu compu: video → transcripción → clips → shorts 9:16.
 *   npx tsx --env-file=.env.local scripts/pipeline.ts "C:\videos\stream.mp4" --layout split --context "stream de Next.js" --max 5
 *
 * Requiere: ffmpeg instalado, DEEPGRAM_API_KEY y ANTHROPIC_API_KEY en .env.local.
 * Es reanudable: si se corta, vuelve a correr el mismo comando.
 */
import { AnthropicStructuredLlm, isEngineError } from "../src/engine";
import { DeepgramTranscriber } from "../src/engine/ingest/deepgram";
import type { Layout } from "../src/engine/media";
import { runLocalPipeline } from "../src/engine/pipeline/local";

const LAYOUTS: Record<string, Layout> = {
  "center-crop": { mode: "center-crop", focusX: 0.5 },
  "blur-fill": { mode: "blur-fill", blurRadius: 24 },
  // Ajusta los rectángulos a tu escena de OBS (coordenadas 0..1 del frame original).
  split: { mode: "split", top: { x: 0.72, y: 0.68, w: 0.28, h: 0.32 }, bottom: { x: 0, y: 0, w: 0.72, h: 1 }, topRatio: 0.38 },
};

const LABEL = { audio: "Extrayendo audio", transcribe: "Transcribiendo (Deepgram)", mine: "Buscando clips (Claude)", render: "Renderizando 9:16" } as const;

async function main() {
  const [video, ...rest] = process.argv.slice(2);
  const arg = (k: string) => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : undefined);
  if (!video) {
    console.error('Uso: tsx --env-file=.env.local scripts/pipeline.ts <video> [--layout blur-fill|center-crop|split] [--context "..."] [--max N] [--out ./out] [--lang es|multi]');
    process.exit(1);
  }
  const layout = LAYOUTS[arg("--layout") ?? "blur-fill"];
  if (!layout) throw new Error(`Layout desconocido. Opciones: ${Object.keys(LAYOUTS).join(", ")}`);

  const ac = new AbortController();
  process.on("SIGINT", () => {
    console.log("\nCancelando… (vuelve a correr el comando para reanudar)");
    ac.abort();
  });

  const t0 = Date.now();
  const res = await runLocalPipeline(
    {
      videoPath: video,
      outDir: arg("--out") ?? "./out",
      layout,
      context: arg("--context"),
      maxClips: arg("--max") ? Number(arg("--max")) : undefined,
    },
    {
      transcriber: new DeepgramTranscriber(undefined, {
        language: arg("--lang") ?? "es",
        keyterms: ["Next.js", "Vercel", "TypeScript", "React", "Claude", "API", "deploy"],
      }),
      llm: new AnthropicStructuredLlm(),
      signal: ac.signal,
      onEvent: (e) => {
        if (e.type === "step") {
          const icon = e.status === "start" ? "…" : e.status === "cached" ? "↺" : "✔";
          console.log(`${icon} ${LABEL[e.step]}${e.status === "cached" ? " (ya estaba)" : ""}${e.detail ? ` — ${e.detail}` : ""}`);
        } else {
          process.stdout.write(`\r   clip ${e.clipIndex + 1}/${e.clipCount}: ${(e.ratio * 100).toFixed(0)}%   `);
        }
      },
    },
  );

  console.log(`\n\n${res.renders.length} shorts listos en ${res.jobDir} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  console.table(res.miner.clips.slice(0, res.renders.length).map((c, i) => ({ hook: c.hookText, dur: `${c.duration}s`, score: c.scores.final, archivo: res.renders[i]!.outputPath.split(/[\\/]/).pop() })));
}

main().catch((err) => {
  console.error(isEngineError(err) ? `\n${err.code}: ${err.message}\n${err.details ?? ""}` : err);
  process.exit(1);
});
