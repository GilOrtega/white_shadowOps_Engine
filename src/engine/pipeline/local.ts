import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { mineClips, type MinerOptions, type MinerResult } from "../agents/miner";
import { EngineError } from "../core/errors";
import type { StructuredLlm } from "../core/llm";
import type { Transcriber } from "../ingest/deepgram";
import { defaultBinaries, probeVideo, runBinary, type MediaBinaries } from "../media/ffmpeg";
import { renderClip } from "../media/render";
import type { Layout, RenderResult } from "../media/schemas";
import { TranscriptSchema, type Transcript } from "../schemas/transcript";

/**
 * Pipeline completo y REANUDABLE para correr en tu compu o en el worker:
 *   video → audio.mp3 → transcript.json → clips.json → renders/*.mp4
 * Cada paso guarda su resultado en <outDir>/<jobId>/. Si truena a la mitad,
 * vuelves a correr y retoma desde el último paso terminado (no paga 2 veces la API).
 */

export type PipelineStep = "audio" | "transcribe" | "mine" | "render";
export type PipelineEvent =
  | { type: "step"; step: PipelineStep; status: "start" | "cached" | "done"; detail?: string }
  | { type: "progress"; step: "render"; clipIndex: number; clipCount: number; ratio: number };

export interface LocalPipelineInput {
  videoPath: string;
  outDir: string;
  layout: Layout;
  jobId?: string;
  context?: string;
  miner?: MinerOptions;
  maxClips?: number;
}

export interface LocalPipelineDeps {
  transcriber: Transcriber;
  llm: StructuredLlm;
  bins?: MediaBinaries;
  signal?: AbortSignal;
  onEvent?: (e: PipelineEvent) => void;
}

export interface LocalPipelineResult {
  jobId: string;
  jobDir: string;
  transcript: Transcript;
  miner: MinerResult;
  renders: RenderResult[];
}

const exists = async (p: string) => {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
};

/** Escritura atómica: nunca deja un JSON a medias si se corta la luz. */
async function writeJson(path: string, data: unknown) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, path);
}

export const jobIdFor = (videoPath: string) =>
  basename(videoPath).replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "job";

export async function runLocalPipeline(input: LocalPipelineInput, deps: LocalPipelineDeps): Promise<LocalPipelineResult> {
  const bins = deps.bins ?? defaultBinaries();
  const emit = deps.onEvent ?? (() => {});
  const videoPath = resolve(input.videoPath);
  if (!(await exists(videoPath))) throw new EngineError("INPUT_INVALID", `No existe el video: ${videoPath}`);

  const jobId = input.jobId ?? jobIdFor(videoPath);
  const jobDir = resolve(input.outDir, jobId);
  await mkdir(jobDir, { recursive: true });

  const probe = await probeVideo(videoPath, bins, deps.signal);
  if (!probe.hasAudio) throw new EngineError("INPUT_INVALID", "El video no tiene audio: no hay nada que transcribir");

  // 1) Audio: mono 16 kHz MP3 (~30 MB por hora) → subida rápida y barata.
  const audioPath = join(jobDir, "audio.mp3");
  if (await exists(audioPath)) emit({ type: "step", step: "audio", status: "cached" });
  else {
    emit({ type: "step", step: "audio", status: "start" });
    const part = join(jobDir, "audio.part.mp3");
    try {
      await runBinary(
        bins.ffmpeg,
        ["-hide_banner", "-nostdin", "-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k", part],
        { timeoutMs: 30 * 60_000, signal: deps.signal },
      );
      await rename(part, audioPath);
    } catch (err) {
      await rm(part, { force: true });
      throw err;
    }
    emit({ type: "step", step: "audio", status: "done" });
  }

  // 2) Transcripción
  const transcriptPath = join(jobDir, "transcript.json");
  let transcript: Transcript;
  if (await exists(transcriptPath)) {
    transcript = TranscriptSchema.parse(JSON.parse(await readFile(transcriptPath, "utf8")));
    emit({ type: "step", step: "transcribe", status: "cached" });
  } else {
    emit({ type: "step", step: "transcribe", status: "start" });
    transcript = await deps.transcriber.transcribeFile(audioPath, jobId, deps.signal);
    await writeJson(transcriptPath, transcript);
    emit({ type: "step", step: "transcribe", status: "done", detail: `${transcript.segments.length} segmentos` });
  }

  // 3) Miner
  const clipsPath = join(jobDir, "clips.json");
  let miner: MinerResult;
  if (await exists(clipsPath)) {
    miner = JSON.parse(await readFile(clipsPath, "utf8")) as MinerResult;
    emit({ type: "step", step: "mine", status: "cached" });
  } else {
    emit({ type: "step", step: "mine", status: "start" });
    miner = await mineClips(deps.llm, transcript, { ...input.miner, context: input.context }, deps.signal);
    await writeJson(clipsPath, miner);
    emit({ type: "step", step: "mine", status: "done", detail: `${miner.clips.length} clips` });
  }

  // 4) Render (cada clip es idempotente por sí mismo)
  const clips = miner.clips.slice(0, input.maxClips ?? miner.clips.length);
  const words = transcript.segments.flatMap((s) => s.words ?? []);
  const renders: RenderResult[] = [];
  emit({ type: "step", step: "render", status: "start", detail: `${clips.length} clips` });
  for (const [i, clip] of clips.entries()) {
    renders.push(
      await renderClip(
        { jobId: "renders", sourcePath: videoPath, clip, words, layout: input.layout, outDir: jobDir },
        {
          bins,
          probe,
          signal: deps.signal,
          onProgress: (ratio) => emit({ type: "progress", step: "render", clipIndex: i, clipCount: clips.length, ratio }),
        },
      ),
    );
  }
  emit({ type: "step", step: "render", status: "done" });

  await writeJson(join(jobDir, "result.json"), {
    jobId,
    video: videoPath,
    clips: clips.map((c, i) => ({ ...c, file: renders[i]!.outputPath })),
  });

  return { jobId, jobDir, transcript, miner, renders };
}
