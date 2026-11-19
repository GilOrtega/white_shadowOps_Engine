/**
 * Clipper de streams (en tu PC, gratis): tu grabación de OBS → Shorts listos en la app.
 *   npm run clipper -- "D:\OBS\2026-12-01 21-03-11.mkv"
 *   npm run clipper -- "<video>" --max 8 --sin-subir
 *
 * Pasos: audio → volumen (momentos fuertes) → Whisper (gratis) → Claude elige → render 9:16 → revisión → sube a la app.
 * Cámara: pon en .env.local  CLIPPER_CAM=x,y,ancho,alto  (fracciones 0..1 de dónde está tu cámara en la escena de OBS).
 *         Sin CLIPPER_CAM sale solo el juego con fondo desenfocado.
 * Requiere en .env.local: ANTHROPIC_API_KEY, WSO_URL, WSO_API_SECRET. Y ffmpeg + Python con `pip install -r engine/requirements.txt`.
 * Es reanudable: si se corta, vuelve a correr el mismo comando.
 */
import { readFile } from "node:fs/promises";
import { upload } from "@vercel/blob/client";
import { AnthropicStructuredLlm, isEngineError } from "../src/engine";
import { WhisperTranscriber } from "../src/engine/ingest/whisper";
import type { Layout } from "../src/engine/media";
import { runLocalPipeline, type PipelineStep } from "../src/engine/pipeline/local";

const LABEL: Record<PipelineStep, string> = {
  audio: "Sacando el audio",
  loudness: "Buscando gritos y reacciones",
  transcribe: "Transcribiendo con Whisper (gratis)",
  mine: "Claude elige los mejores momentos",
  render: "Editando en vertical",
  qa: "Revisando cada clip",
};

/** "x,y,w,h" en fracciones → layout cámara arriba + juego abajo. */
export function layoutFor(cam: string | undefined): Layout {
  if (!cam) return { mode: "blur-fill", blurRadius: 24 };
  const [x, y, w, h] = cam.split(",").map(Number);
  const ok = [x, y, w, h].every((n) => Number.isFinite(n) && n! >= 0 && n! <= 1) && w! > 0 && h! > 0 && x! + w! <= 1.0001 && y! + h! <= 1.0001;
  if (!ok) throw new Error(`CLIPPER_CAM inválido ("${cam}"). Formato: x,y,ancho,alto en fracciones, ej. 0.72,0.68,0.28,0.32`);
  return { mode: "split", top: { x: x!, y: y!, w: w!, h: h! }, bottom: { x: 0.2, y: 0, w: 0.6, h: 1 }, topRatio: 0.38 };
}

async function main() {
  const [video, ...rest] = process.argv.slice(2);
  const arg = (k: string) => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : undefined);
  if (!video) {
    console.error('Uso: npm run clipper -- "<grabación de OBS>" [--max 8] [--contexto "GTA RP con amigos"] [--sin-subir]');
    process.exit(1);
  }
  const subir = !rest.includes("--sin-subir");
  const base = (process.env.WSO_URL ?? "https://whiteshadow-ops-j4zu.vercel.app").replace(/\/$/, "");
  const key = process.env.WSO_API_SECRET ?? "";
  if (subir && !key) throw new Error("Falta WSO_API_SECRET en .env.local (o usa --sin-subir).");

  const ac = new AbortController();
  process.on("SIGINT", () => {
    console.log("\nCancelando… (vuelve a correr el comando para reanudar)");
    ac.abort();
  });

  const t0 = Date.now();
  const res = await runLocalPipeline(
    {
      videoPath: video,
      outDir: arg("--out") ?? "./out/streams",
      layout: layoutFor(process.env.CLIPPER_CAM),
      context: arg("--contexto") ?? "Stream de GTA en PS5, en español mexicano, con cámara.",
      maxClips: Number(arg("--max") ?? 8),
      loudness: true,
      qa: true,
      miner: { profile: "gaming", minDurationSec: 15, maxDurationSec: 45, maxClipsPerWindow: 3, maxClipsTotal: 20, minFinalScore: 50, windowSec: 600, overlapSec: 60 },
    },
    {
      transcriber: new WhisperTranscriber(),
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

  const rows = res.renders.map((r, i) => ({ r, c: res.miner.clips[i]!, q: res.qa[i]! }));
  console.log(`\n\n${rows.length} clips en ${res.jobDir} (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
  console.table(rows.map(({ r, c, q }) => ({ revision: q.level.toUpperCase(), gancho: c.hookText, dur: `${Math.round(r.durationSec)}s`, puntos: c.scores.final, notas: q.notes.join(", ") })));

  if (!subir) return;
  let n = 0;
  for (const { r, c, q } of rows) {
    if (q.level === "fail") continue;
    const blob = await upload(`shorts/out/stream-${res.jobId}-${c.id}.mp4`, new Blob([await readFile(r.outputPath)], { type: "video/mp4" }), {
      access: "public",
      handleUploadUrl: `${base}/api/engine/upload`,
      clientPayload: JSON.stringify({ key }),
      multipart: true,
      contentType: "video/mp4",
    });
    const reg = await fetch(`${base}/api/engine/clips`, {
      method: "POST",
      headers: { "x-wso-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ result: { url: blob.url, pathname: blob.pathname, durationSec: Math.round(r.durationSec * 10) / 10 }, hook: c.hookText.slice(0, 80), transcript: c.transcriptExcerpt.slice(0, 4000), qa: { level: q.level, notes: q.notes } }),
    });
    if (!reg.ok) throw new Error(`La app respondió ${reg.status} al registrar el clip (¿WSO_API_SECRET correcto?).`);
    n++;
    console.log(`↑ subido: ${c.hookText}`);
  }
  console.log(`\n${n} clips subidos. Revísalos en WhiteShadow → Contenido → Motor.`);
}

if (process.argv[1]?.endsWith("clipper.ts")) {
  main().catch((err) => {
    console.error(isEngineError(err) ? `\n${err.code}: ${err.message}\n${err.details ?? ""}` : err);
    process.exit(1);
  });
}
