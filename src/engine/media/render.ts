import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { EngineError } from "../core/errors";
import { buildRenderArgs, defaultBinaries, probeVideo, runBinary, type MediaBinaries } from "./ffmpeg";
import { buildVideoFilter } from "./layout";
import { RenderJobSchema, type RenderJobInput, type RenderResult, type VideoProbe } from "./schemas";
import { buildAss } from "./subtitles";

export interface RenderDeps {
  bins?: MediaBinaries;
  signal?: AbortSignal;
  onProgress?: (ratio: number) => void;
  /** Evita re-probar el mismo original para cada clip. */
  probe?: VideoProbe;
}

const exists = async (p: string) => {
  try {
    const s = await stat(p);
    return s.isFile() && s.size > 0 ? s : null;
  } catch {
    return null;
  }
};

/**
 * Renderiza UN clip vertical: recorte 9:16 + subtítulos quemados + audio normalizado.
 * Idempotente: si `<outDir>/<jobId>/<clipId>.mp4` ya existe, regresa ese archivo
 * (salvo `force`). Escribe a `.part.mp4` y renombra al final: nunca deja un mp4 a medias.
 */
export async function renderClip(input: RenderJobInput, deps: RenderDeps = {}): Promise<RenderResult> {
  const t0 = Date.now();
  const parsed = RenderJobSchema.safeParse(input);
  if (!parsed.success) throw new EngineError("INPUT_INVALID", z.prettifyError(parsed.error));
  const job = parsed.data;
  const bins = deps.bins ?? defaultBinaries();

  const workDir = resolve(job.outDir, job.jobId);
  await mkdir(workDir, { recursive: true });
  const outName = `${job.clip.id}.mp4`;
  const outPath = join(workDir, outName);

  const cached = !job.force && (await exists(outPath));
  if (cached) {
    return {
      jobId: job.jobId, clipId: job.clip.id, outputPath: outPath, assPath: null,
      durationSec: job.clip.endTime - job.clip.startTime, bytes: cached.size, cached: true,
      elapsedMs: Date.now() - t0, ffmpegArgs: [],
    };
  }

  const probe = deps.probe ?? (await probeVideo(resolve(job.sourcePath), bins, deps.signal));
  if (job.clip.startTime >= probe.durationSec) {
    throw new EngineError("INPUT_INVALID", `El clip empieza (${job.clip.startTime}s) después del final del video (${probe.durationSec}s)`);
  }
  const endTime = Math.min(job.clip.endTime, probe.durationSec);
  const duration = endTime - job.clip.startTime;

  let assFile: string | undefined;
  if (job.subtitles && job.words.length > 0) {
    assFile = `${job.clip.id}.ass`;
    const ass = buildAss({
      words: job.words,
      clipStart: job.clip.startTime,
      clipEnd: endTime,
      style: job.subtitles,
      width: job.output.width,
      height: job.output.height,
    });
    await writeFile(join(workDir, assFile), ass, "utf8");
  }

  const filterComplex = buildVideoFilter({ layout: job.layout, probe, output: job.output, assFile });
  const partName = `${job.clip.id}.part.mp4`;
  const ffmpegArgs = buildRenderArgs({
    input: resolve(job.sourcePath),
    startTime: job.clip.startTime,
    duration,
    filterComplex,
    hasAudio: probe.hasAudio,
    output: job.output,
    outFile: partName,
  });

  try {
    await runBinary(bins.ffmpeg, ffmpegArgs, {
      cwd: workDir, // el .ass se referencia por nombre relativo
      signal: deps.signal,
      timeoutMs: job.timeoutMs,
      totalSec: duration,
      onProgress: deps.onProgress,
    });
    await rename(join(workDir, partName), outPath);
  } catch (err) {
    await rm(join(workDir, partName), { force: true });
    throw err;
  }

  const done = await exists(outPath);
  if (!done) throw new EngineError("MEDIA_RENDER_FAILED", "FFmpeg terminó pero no generó el archivo");

  return {
    jobId: job.jobId, clipId: job.clip.id, outputPath: outPath,
    assPath: assFile ? join(workDir, assFile) : null,
    durationSec: duration, bytes: done.size, cached: false,
    elapsedMs: Date.now() - t0, ffmpegArgs,
  };
}
