import type { Word } from "../schemas/transcript";
import type { SubtitleStyle } from "./schemas";

/** ASS usa &HAABBGGRR (alpha + BGR), no RGB. */
export function hexToAss(hex: string, alpha = 0): string {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  const a = alpha.toString(16).padStart(2, "0");
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

/** h:mm:ss.cc (centésimas), formato de tiempo de ASS. */
export function assTime(sec: number): string {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

/** Escapa texto del transcript para que no se interprete como tags ASS. */
export function escapeAss(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/\r?\n/g, " ")
    .trim();
}

interface RelWord {
  text: string;
  start: number;
  end: number;
}

/** Palabras dentro del clip, con tiempos relativos al inicio del clip. */
export function wordsInClip(words: Word[], clipStart: number, clipEnd: number): RelWord[] {
  const dur = clipEnd - clipStart;
  return words
    .filter((w) => w.end > clipStart && w.start < clipEnd && w.text.trim().length > 0)
    .map((w) => ({
      text: w.text.trim(),
      start: Math.max(0, w.start - clipStart),
      end: Math.min(dur, w.end - clipStart),
    }))
    .filter((w) => w.end > w.start);
}

/** Agrupa en chunks cortos: corta por tamaño, por pausas y por fin de frase. */
export function chunkWords(words: RelWord[], maxWords: number, maxGapSec: number): RelWord[][] {
  const chunks: RelWord[][] = [];
  let cur: RelWord[] = [];
  for (const w of words) {
    const prev = cur.at(-1);
    const gap = prev ? w.start - prev.end : 0;
    if (cur.length >= maxWords || (prev && gap > maxGapSec)) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(w);
    if (/[.!?…]$/.test(w.text)) {
      chunks.push(cur);
      cur = [];
    }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/**
 * Genera un .ass con subtítulos "palabra activa": el chunk se ve completo y la
 * palabra que se está diciendo se pinta del color de highlight y crece un poco.
 */
export function buildAss(args: {
  words: Word[];
  clipStart: number;
  clipEnd: number;
  style: SubtitleStyle;
  width: number;
  height: number;
  /** Auto-Hook: texto grande arriba durante los primeros segundos (lo que evita que deslicen). */
  hook?: { text: string; durationSec: number } | null;
}): string {
  const { style } = args;
  const rel = wordsInClip(args.words, args.clipStart, args.clipEnd);
  const chunks = chunkWords(rel, style.maxWordsPerChunk, style.maxGapSec);
  const fmt = (t: string) => escapeAss(style.uppercase ? t.toLocaleUpperCase("es-MX") : t);
  const hl = hexToAss(style.highlightColor);

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${args.width}`,
    `PlayResY: ${args.height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    [
      "Style: Shorts",
      style.fontName,
      style.fontSize,
      hexToAss(style.primaryColor),
      hexToAss(style.highlightColor),
      hexToAss(style.outlineColor),
      hexToAss("#000000", 0x80),
      style.bold ? -1 : 0,
      0, 0, 0, 100, 100, 0, 0,
      1,
      style.outline,
      0,
      2, // abajo-centro
      60, 60,
      style.marginV,
      1,
    ].join(","),
    // Gancho: texto negro sobre caja blanca opaca (BorderStyle 3), arriba-centro.
    [
      "Style: Hook",
      style.fontName,
      Math.round(style.fontSize * 0.86),
      hexToAss("#000000"),
      hexToAss("#000000"),
      hexToAss("#FFFFFF"),
      hexToAss("#FFFFFF"),
      -1,
      0, 0, 0, 100, 100, 0, 0,
      3,
      18,
      0,
      8, // arriba-centro
      90, 90,
      Math.round(args.height * 0.14),
      1,
    ].join(","),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events: string[] = [];
  const hookText = args.hook?.text.trim();
  if (hookText) {
    const hookEnd = Math.min(args.hook!.durationSec, Math.max(0.5, args.clipEnd - args.clipStart));
    events.push(`Dialogue: 1,${assTime(0)},${assTime(hookEnd)},Hook,,0,0,0,,${escapeAss(hookText)}`);
  }
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const w = chunk[i]!;
      // La palabra activa dura hasta que empieza la siguiente (sin parpadeos entre palabras).
      const end = i + 1 < chunk.length ? chunk[i + 1]!.start : w.end;
      if (end <= w.start) continue;
      const text = chunk
        .map((cw, j) => (j === i ? `{\\c${hl}\\fscx112\\fscy112}${fmt(cw.text)}{\\r}` : fmt(cw.text)))
        .join(" ");
      events.push(`Dialogue: 0,${assTime(w.start)},${assTime(end)},Shorts,,0,0,0,,${text}`);
    }
  }

  return [...header, ...events, ""].join("\n");
}
