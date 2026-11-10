import type { TranscriptSegment } from "../../schemas/transcript";

export interface TranscriptWindow {
  index: number;
  segments: TranscriptSegment[];
  start: number;
  end: number;
}

/**
 * Parte transcripciones largas (livestreams de horas) en ventanas con
 * traslape, para que un clip que cae en la frontera no se pierda y para
 * mantener cada llamada al modelo barata y con buena atención.
 */
export function buildWindows(
  segments: TranscriptSegment[],
  windowSec: number,
  overlapSec: number,
): TranscriptWindow[] {
  if (segments.length === 0) return [];
  if (overlapSec >= windowSec) throw new Error("overlapSec debe ser menor que windowSec");

  const windows: TranscriptWindow[] = [];
  let startIdx = 0;

  while (startIdx < segments.length) {
    const winStart = segments[startIdx]!.start;
    const limit = winStart + windowSec;

    let endIdx = startIdx;
    while (endIdx + 1 < segments.length && segments[endIdx + 1]!.end <= limit) endIdx++;

    const slice = segments.slice(startIdx, endIdx + 1);
    windows.push({ index: windows.length, segments: slice, start: winStart, end: slice.at(-1)!.end });

    if (endIdx === segments.length - 1) break;

    // Siguiente ventana: retrocede `overlapSec` desde el final, pero siempre avanza.
    const nextStartTime = segments[endIdx]!.end - overlapSec;
    let next = endIdx;
    while (next > startIdx + 1 && segments[next - 1]!.start >= nextStartTime) next--;
    startIdx = Math.max(next, startIdx + 1);
  }

  return windows;
}

/** Intersección temporal / duración del clip más corto (0..1). */
export function overlapRatio(a: { startTime: number; endTime: number }, b: { startTime: number; endTime: number }) {
  const inter = Math.max(0, Math.min(a.endTime, b.endTime) - Math.max(a.startTime, b.startTime));
  const shortest = Math.min(a.endTime - a.startTime, b.endTime - b.startTime);
  return shortest > 0 ? inter / shortest : 0;
}

/** Corre tareas con límite de concurrencia (para no pegarle al rate limit). */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}
