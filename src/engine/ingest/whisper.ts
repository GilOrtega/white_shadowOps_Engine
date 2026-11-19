import { readFile, rm } from "node:fs/promises";
import { EngineError } from "../core/errors";
import { runBinary } from "../media/ffmpeg";
import { TranscriptSchema, type Transcript } from "../schemas/transcript";
import type { Transcriber } from "./deepgram";

/**
 * Transcripción GRATIS en tu compu con faster-whisper (engine/transcribe.py).
 * Usa la tarjeta NVIDIA si hay (WHISPER_DEVICE=cuda) o el CPU.
 * Requiere: Python 3.10+ y `pip install -r engine/requirements.txt`.
 */
export class WhisperTranscriber implements Transcriber {
  constructor(
    private readonly opts: { python?: string; script?: string; model?: string; device?: string; language?: string } = {},
  ) {}

  async transcribeFile(audioPath: string, sourceId: string, signal?: AbortSignal): Promise<Transcript> {
    const out = `${audioPath}.whisper.json`;
    const env = {
      WHISPER_MODEL: this.opts.model ?? process.env.WHISPER_MODEL ?? "small",
      WHISPER_DEVICE: this.opts.device ?? process.env.WHISPER_DEVICE ?? "auto",
      WHISPER_LANG: this.opts.language ?? "es",
    };
    try {
      await runBinary(
        this.opts.python ?? process.env.WHISPER_PYTHON ?? (process.platform === "win32" ? "python" : "python3"),
        [this.opts.script ?? "engine/transcribe.py", audioPath, out, "--segments"],
        { timeoutMs: 6 * 3600_000, signal, env: { ...process.env, ...env } },
      );
    } catch (err) {
      throw new EngineError("TRANSCRIPTION_FAILED", "Whisper no pudo transcribir. ¿Instalaste Python y `pip install -r engine/requirements.txt`?", { cause: err });
    }
    const raw = JSON.parse(await readFile(out, "utf8")) as { durationSec: number; segments: { start: number; end: number; text: string; words: { text: string; start: number; end: number }[] }[] };
    await rm(out, { force: true });
    const segments = raw.segments
      .filter((s) => s.text.trim())
      .map((s, id) => ({ id, start: s.start, end: Math.max(s.start, s.end), text: s.text.trim(), words: s.words }));
    if (!segments.length) throw new EngineError("TRANSCRIPTION_FAILED", "Whisper no encontró voz en el audio.");
    return TranscriptSchema.parse({ sourceId, language: env.WHISPER_LANG, durationSec: Math.max(raw.durationSec, segments.at(-1)!.end, 1), segments });
  }
}
