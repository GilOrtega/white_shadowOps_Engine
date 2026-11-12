"use client";

import { useSyncExternalStore } from "react";

/**
 * Preferencias de la interfaz (no son datos del reto): si el inspector está abierto, etc.
 * Viven aparte de `wso.hq.v1` para que un respaldo/restauración no las toque.
 */
export interface UiPrefs {
  /** Panel derecho (inspector) en pantallas grandes. */
  inspector: boolean;
  /** Avisos push de "Rapo a la 0" activos en este dispositivo. */
  push: boolean;
  /** Secciones desplegables abiertas/cerradas por el usuario (id → abierta). */
  open: Record<string, boolean>;
}

const KEY = "wso.ui.v1";
const DEFAULTS: UiPrefs = { inspector: true, push: false, open: {} };
let cache: UiPrefs | null = null;
const listeners = new Set<() => void>();

function read(): UiPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<UiPrefs>) };
  } catch {
    /* sin almacenamiento: se usan los valores por defecto */
  }
  return DEFAULTS;
}

const snapshot = () => (cache ??= read());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useUiPrefs(): UiPrefs {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULTS);
}

/** Lectura puntual (fuera de render), p. ej. dentro de un listener. */
export const getUiPrefs = (): UiPrefs => snapshot();

export function setUiPrefs(patch: Partial<UiPrefs>) {
  cache = { ...snapshot(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* se queda en memoria */
  }
  listeners.forEach((l) => l());
}

/**
 * Actividad global que la mascota refleja (p. ej. el Crew trabajando).
 * Es efímera: no se guarda.
 */
export type GhostActivity = { kind: "pensando"; label: string } | { kind: "exito"; label: string } | null;
let activity: GhostActivity = null;
const activityListeners = new Set<() => void>();

export function setGhostActivity(next: GhostActivity) {
  activity = next;
  activityListeners.forEach((l) => l());
}

export function useGhostActivity(): GhostActivity {
  return useSyncExternalStore(
    (cb) => {
      activityListeners.add(cb);
      return () => activityListeners.delete(cb);
    },
    () => activity,
    () => null,
  );
}
