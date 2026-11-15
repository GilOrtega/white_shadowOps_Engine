"""Transcribe un audio con faster-whisper (gratis, en CPU) y escribe palabras con tiempos en JSON.

Uso: python engine/transcribe.py <audio> <salida.json>
Formato: {"words": [{"text": "hola", "start": 0.12, "end": 0.4}], "text": "..."}
"""
import json
import os
import sys

from faster_whisper import WhisperModel

MODEL = os.environ.get("WHISPER_MODEL", "small")


def main(audio: str, out: str) -> None:
    model = WhisperModel(MODEL, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(audio, language="es", word_timestamps=True, vad_filter=True)
    words, texts = [], []
    for seg in segments:
        texts.append(seg.text.strip())
        for w in seg.words or []:
            t = w.word.strip()
            if t:
                words.append({"text": t, "start": round(max(0.0, w.start), 3), "end": round(max(w.start, w.end), 3)})
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"words": words, "text": " ".join(texts).strip()}, f, ensure_ascii=False)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
