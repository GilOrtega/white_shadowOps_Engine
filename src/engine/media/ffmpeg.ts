import { spawn } from "node:child_process";
import { z } from "zod";
import { EngineError } from "../core/errors";
import type { OutputSpec, VideoProbe } from "./schemas";
import { VideoProbeSchema } from "./schemas";

/**
 * Capa delgada sobre los binarios. Todo se ejecuta con spawn y un ARRAY de
 * argumentos (nunca un string de shell): cero inyección de comandos aunque el
 * nombre del archivo venga raro.
 */
export interface MediaBinaries {
  ffmpeg: string;
  ffprobe: string;
}

export const defaultBinaries = (): MediaBinaries => ({
  ffmpeg: process.env.FFMPEG_PATH || "ffmpeg",
  ffprobe: process.env.FFPROBE_PATH || "ffprobe",
});

const secs = (n: number) => n.toFixed(3);

export function buildRenderArgs(args: {
  input: string;
  startTime: number;
  duration: number;
  filterComplex: string;
  hasAudio: boolean;
  output: OutputSpec;
  outFile: string;
}): string[] {
  const o = args.output;
  const audio = args.hasAudio
    ? [
        "-map", "0:a:0",
        ...(o.normalizeAudio ? ["-af", "loudnorm=I=-14:TP=-1.5:LRA=11"] : []),
        "-c:a", "aac", "-b:a", o.audioBitrate, "-ar", "48000", "-ac", "2",
      ]
    : ["-an"];

  return [
    "-hide_banner", "-nostdin", "-y",
    // -ss antes de -i: seek rápido; con re-encode es preciso al frame.
    "-ss", secs(args.startTime),
    "-i", args.input,
    "-t", secs(args.duration),
    "-filter_complex", args.filterComplex,
    "-map", "[v]",
    ...audio,
    "-c:v", "libx264", "-preset", o.preset, "-crf", String(o.crf),
    "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-progress", "pipe:1", "-nostats",
    args.outFile,
  ];
}

interface RunOptions {
  cwd?: string;
  signal?: AbortSignal;
  timeoutMs: number;
  /** Duración esperada de salida, para calcular el % de progreso. */
  totalSec?: number;
  onProgress?: (ratio: number) => void;
}

/** Ejecuta un binario; guarda solo la cola de stderr (FFmpeg es muy verboso). */
export function runBinary(bin: string, argv: string[], opts: RunOptions): Promise<{ stdout: string; stderrTail: string }> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new EngineError("ABORTED", "Operación cancelada"));

    const child = spawn(bin, argv, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const MAX_TAIL = 8_000;

    const finish = (err: EngineError | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (err) reject(err);
      else resolve({ stdout, stderrTail: stderr.slice(-MAX_TAIL) });
    };
    const kill = () => {
      if (!child.killed) child.kill("SIGKILL");
    };
    const onAbort = () => {
      kill();
      finish(new EngineError("ABORTED", "Operación cancelada"));
    };
    const timer = setTimeout(() => {
      kill();
      finish(new EngineError("MEDIA_TIMEOUT", `${bin} excedió ${opts.timeoutMs} ms`, { retryable: true }));
    }, opts.timeoutMs);
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
      if (opts.onProgress && opts.totalSec) {
        const m = /out_time_us=(\d+)/g;
        let last: RegExpExecArray | null = null;
        for (let r = m.exec(chunk); r; r = m.exec(chunk)) last = r;
        if (last) opts.onProgress(Math.min(1, Number(last[1]) / 1e6 / opts.totalSec));
      }
      if (stdout.length > 64_000) stdout = stdout.slice(-16_000);
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > MAX_TAIL * 4) stderr = stderr.slice(-MAX_TAIL);
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      finish(
        err.code === "ENOENT"
          ? new EngineError("MEDIA_BINARY_MISSING", `No se encontró ${bin}. Instálalo o define FFMPEG_PATH/FFPROBE_PATH.`)
          : new EngineError("MEDIA_RENDER_FAILED", err.message, { cause: err }),
      );
    });
    child.on("close", (code) => {
      if (code === 0) finish(null);
      else
        finish(
          new EngineError("MEDIA_RENDER_FAILED", `${bin} terminó con código ${code}`, {
            details: stderr.slice(-2_000),
          }),
        );
    });
  });
}

// --- ffprobe ---------------------------------------------------------------

const FfprobeRawSchema = z.object({
  streams: z.array(
    z.object({
      codec_type: z.string(),
      codec_name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      r_frame_rate: z.string().optional(),
      avg_frame_rate: z.string().optional(),
      duration: z.string().optional(),
      tags: z.record(z.string(), z.string()).optional(),
      side_data_list: z.array(z.object({ rotation: z.number().optional() }).loose()).optional(),
    }).loose(),
  ),
  format: z.object({ duration: z.string().optional() }).loose(),
});

const parseRate = (r?: string) => {
  if (!r) return 0;
  const [n, d] = r.split("/").map(Number);
  return d ? n! / d : Number(n) || 0;
};

export async function probeVideo(path: string, bins = defaultBinaries(), signal?: AbortSignal): Promise<VideoProbe> {
  let out: string;
  try {
    ({ stdout: out } = await runBinary(
      bins.ffprobe,
      ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", path],
      { timeoutMs: 30_000, signal },
    ));
  } catch (err) {
    if (err instanceof EngineError && err.code !== "MEDIA_RENDER_FAILED") throw err;
    throw new EngineError("MEDIA_PROBE_FAILED", `ffprobe no pudo leer ${path}`, { cause: err });
  }

  const raw = FfprobeRawSchema.safeParse(JSON.parse(out));
  if (!raw.success) throw new EngineError("MEDIA_PROBE_FAILED", z.prettifyError(raw.error));

  const v = raw.data.streams.find((s) => s.codec_type === "video");
  if (!v || !v.width || !v.height) throw new EngineError("MEDIA_PROBE_FAILED", "El archivo no tiene stream de video");

  const rotation = Math.abs(v.side_data_list?.find((d) => typeof d.rotation === "number")?.rotation ?? Number(v.tags?.rotate ?? 0)) % 180;
  const [width, height] = rotation === 90 ? [v.height, v.width] : [v.width, v.height];

  const probe = VideoProbeSchema.safeParse({
    durationSec: Number(raw.data.format.duration ?? v.duration ?? 0),
    width,
    height,
    fps: parseRate(v.avg_frame_rate) || parseRate(v.r_frame_rate) || 30,
    hasAudio: raw.data.streams.some((s) => s.codec_type === "audio"),
    videoCodec: v.codec_name ?? "unknown",
  });
  if (!probe.success) throw new EngineError("MEDIA_PROBE_FAILED", z.prettifyError(probe.error));
  return probe.data;
}
