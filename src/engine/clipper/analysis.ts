/**
 * Análisis de audio y revisión de clips para el Clipper de streams (todo puro y probado).
 * - Momentos de volumen alto: picos de RMS por segundo sobre la mediana del stream.
 * - Revisión PASS / WARN / FAIL: silencio, duración, sin voz, pantalla negra.
 */

/** ffmpeg: RMS por segundo del audio (mono 16 kHz) impreso como metadata. */
export const rmsArgs = (audio: string) => [
  "-hide_banner", "-nostdin", "-nostats", "-loglevel", "error", "-i", audio,
  "-af", "asetnsamples=n=16000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
  "-f", "null", "-",
];

/** Lee la salida de `rmsArgs` → dB por segundo (silencio total = -90). */
export function parseRms(out: string): number[] {
  const vals: number[] = [];
  for (const m of out.matchAll(/lavfi\.astats\.Overall\.RMS_level=(-?inf|-?[\d.]+)/g)) {
    const v = m[1]!.includes("inf") ? -90 : Number(m[1]);
    vals.push(Number.isFinite(v) ? Math.max(-90, v) : -90);
  }
  return vals;
}

const median = (xs: number[]) => {
  if (!xs.length) return -90;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

/**
 * Segundos donde el volumen sube fuerte (gritos, risas, reacciones).
 * Toma los más altos que estén ≥ `aboveDb` sobre la mediana, separados al menos `gapSec`.
 */
export function loudHotspots(rms: number[], opts: { aboveDb?: number; gapSec?: number; max?: number } = {}): number[] {
  const above = opts.aboveDb ?? 9;
  const gap = opts.gapSec ?? 30;
  const max = opts.max ?? 60;
  const base = median(rms.filter((v) => v > -80));
  const cands = rms.map((v, t) => ({ t, v })).filter((x) => x.v >= base + above).sort((a, b) => b.v - a.v);
  const picked: number[] = [];
  for (const c of cands) {
    if (picked.length >= max) break;
    if (picked.every((p) => Math.abs(p - c.t) >= gap)) picked.push(c.t);
  }
  return picked.sort((a, b) => a - b);
}

/** Qué tan "intenso" es un tramo: dB del pico sobre la mediana del stream (0 si nada). */
export function intensity(rms: number[], start: number, end: number): number {
  const base = median(rms.filter((v) => v > -80));
  const slice = rms.slice(Math.max(0, Math.floor(start)), Math.ceil(end));
  if (!slice.length) return 0;
  return Math.max(0, Math.round((Math.max(...slice) - base) * 10) / 10);
}

/** ffmpeg: detecta silencios y pantalla negra del clip ya renderizado. */
export const qaArgs = (clip: string) => [
  "-hide_banner", "-nostdin", "-nostats", "-i", clip,
  "-vf", "blackdetect=d=0.5:pix_th=0.1",
  "-af", "silencedetect=noise=-38dB:d=0.7",
  "-f", "null", "-",
];

/** Suma la duración de los tramos `silence_duration` / `black_duration` que imprime ffmpeg. */
export function parseQa(out: string): { silenceSec: number; blackSec: number } {
  const sum = (re: RegExp) => [...out.matchAll(re)].reduce((n, m) => n + Number(m[1]), 0);
  return {
    silenceSec: Math.round(sum(/silence_duration:\s*([\d.]+)/g) * 10) / 10,
    blackSec: Math.round(sum(/black_duration:\s*([\d.]+)/g) * 10) / 10,
  };
}

export type QaLevel = "pass" | "warn" | "fail";
export type QaResult = { level: QaLevel; notes: string[]; silencePct: number };

/** La revisión: FAIL no se sube; WARN se sube marcado para que lo veas primero. */
export function reviewClip(m: { durationSec: number; silenceSec: number; blackSec: number; words: number }): QaResult {
  const notes: string[] = [];
  let level: QaLevel = "pass";
  const bump = (l: QaLevel) => {
    if (l === "fail" || (l === "warn" && level === "pass")) level = l;
  };
  const silencePct = m.durationSec > 0 ? Math.round((m.silenceSec / m.durationSec) * 100) : 100;
  if (m.durationSec < 8) { bump("fail"); notes.push(`Muy corto (${m.durationSec.toFixed(0)} s)`); }
  else if (m.durationSec > 60) { bump("warn"); notes.push(`Largo para Short (${m.durationSec.toFixed(0)} s)`); }
  if (silencePct >= 45) { bump("fail"); notes.push(`Casi todo en silencio (${silencePct}%)`); }
  else if (silencePct >= 25) { bump("warn"); notes.push(`Silencio ${silencePct}%`); }
  if (m.blackSec >= m.durationSec * 0.4) { bump("fail"); notes.push("Pantalla negra (¿HDCP o escena vacía?)"); }
  else if (m.blackSec >= 1) { bump("warn"); notes.push(`${m.blackSec.toFixed(1)} s en negro`); }
  const wps = m.durationSec > 0 ? m.words / m.durationSec : 0;
  if (m.words === 0) { bump("warn"); notes.push("Sin voz: solo juego"); }
  else if (wps < 0.6) { bump("warn"); notes.push("Hablas poco en este clip"); }
  return { level, notes, silencePct };
}
