import type { HqState } from "./schemas";

/**
 * Reglas de sincronización. Además de "gana lo más nuevo", un dispositivo sin datos
 * NUNCA reemplaza a uno con datos: así abrir la app en un navegador nuevo no borra tu historial.
 */
export function contentScore(s: HqState) {
  const days = Object.values(s.days);
  return (
    days.length * 3 +
    days.reduce((n, d) => n + d.meals.length + (d.weightKg !== null ? 1 : 0) + (d.trainingDone ? 1 : 0) + (d.todos?.length ?? 0), 0) +
    (s.plan ? 5 : 0) +
    s.habits.length +
    s.contentWeek.items.length +
    s.work.projects.length +
    s.money.entries.length +
    (s.profile.photo ? 1 : 0)
  );
}

export const isEmptyState = (s: HqState) => contentScore(s) === 0;

export type SyncDecision = "adopt" | "push" | "none";

/** Qué hacer al abrir la app, comparando este dispositivo con la nube. */
export function decide(local: HqState, localAt: number, cloud: { state: HqState; updatedAt: number } | null): SyncDecision {
  const localEmpty = isEmptyState(local);
  if (!cloud || isEmptyState(cloud.state)) return localEmpty ? "none" : "push";
  if (localEmpty) return "adopt";
  if (cloud.updatedAt > localAt) return "adopt";
  if (localAt > cloud.updatedAt) return "push";
  return "none";
}

/** En el servidor: ¿se acepta esta subida? */
export function acceptPut(incoming: { state: HqState; updatedAt: number }, cloud: { state: HqState; updatedAt: number } | null) {
  if (!cloud) return !isEmptyState(incoming.state);
  if (isEmptyState(incoming.state) && !isEmptyState(cloud.state)) return false;
  if (isEmptyState(cloud.state)) return true;
  return incoming.updatedAt >= cloud.updatedAt;
}
