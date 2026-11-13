import { EXERCISES, ROUTINE_MEDIA, type ExerciseMedia } from "./exercise-db.gen";

export type { ExerciseMedia };
export const MEDIA_CREDIT = "Animaciones © Gym visual (gymvisual.com)";

/** Ejercicio que toca hacer: el que elegiste en su lugar, o el de la rutina. */
export function mediaFor(id: string, swap?: string | null): ExerciseMedia | null {
  const list = ROUTINE_MEDIA[id];
  if (!list) return null;
  const chosen = swap && list.includes(swap) ? swap : list[0]!;
  return EXERCISES[chosen] ?? null;
}

/** Otras opciones para el mismo músculo, con las que se hacen en casa al final. */
export function alternativesFor(id: string, swap?: string | null): ExerciseMedia[] {
  const current = mediaFor(id, swap)?.id;
  return (ROUTINE_MEDIA[id] ?? [])
    .filter((x) => x !== current)
    .map((x) => EXERCISES[x])
    .filter((x): x is ExerciseMedia => Boolean(x))
    .sort((a, b) => Number(a.home) - Number(b.home));
}

export const isSwapValid = (id: string, swap: string) => (ROUTINE_MEDIA[id] ?? []).slice(1).includes(swap);
export const gifUrl = (m: ExerciseMedia) => `/ex/${m.id}.gif`;
export const thumbUrl = (m: ExerciseMedia) => `/ex/${m.id}.jpg`;
