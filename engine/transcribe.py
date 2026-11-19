"""Transcribe un audio con faster-whisper (gratis) y escribe palabras con tiempos en JSON.

Uso:
  python engine/transcribe.py <audio> <salida.json>             -> {"words": [...], "text": "..."}
  python engine/transcribe.py <audio> <salida.json> --segments  -> además {"segments": [...], "durationSec": n}

Variables: WHISPER_MODEL (small), WHISPER_DEVICE (auto|cpu|cuda), WHISPER_LANG (es).
"""
import json
import os
import sys

from faster_whisper import WhisperModel

MODEL = os.environ.get("WHISPER_MODEL", "small")
DEVICE = os.environ.get("WHISPER_DEVICE", "auto")
LANG = os.environ.get("WHISPER_LANG", "es")


def load() -> WhisperModel:
    if DEVICE in ("auto", "cuda"):
        try:
            return WhisperModel(MODEL, device="cuda", compute_type="float16")
        except Exception:  # sin NVIDIA / CUDA: se va al CPU
            if DEVICE == "cuda":
                raise
    return WhisperModel(MODEL, device="cpu", compute_type="int8")


def main(audio: str, out: str, with_segments: bool) -> None:
    model = load()
    segments, info = model.transcribe(audio, language=LANG, word_timestamps=True, vad_filter=True)
    words, texts, segs = [], [], []
    for seg in segments:
        texts.append(seg.text.strip())
        seg_words = []
        for w in seg.words or []:
            t = w.word.strip()
            if t:
                seg_words.append({"text": t, "start": round(max(0.0, w.start), 3), "end": round(max(w.start, w.end), 3)})
        words.extend(seg_words)
        if with_segments:
            segs.append({"start": round(seg.start, 3), "end": round(seg.end, 3), "text": seg.text.strip(), "words": seg_words})
            print(f"  {seg.end / 60:6.1f} min", end="\r", flush=True)
    data = {"words": words, "text": " ".join(texts).strip()}
    if with_segments:
        data["segments"] = segs
        data["durationSec"] = round(getattr(info, "duration", 0) or 0, 3)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], "--segments" in sys.argv[3:])
