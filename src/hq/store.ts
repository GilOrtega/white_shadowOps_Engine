"use client";

import { useSyncExternalStore } from "react";
import { dayOf } from "./logic";
import { defaultState, HqStateSchema, MealSchema, type DayLog, type Feeling, type HqState, type Meal, type Plan, type Profile } from "./schemas";

/**
 * Guardado del centro de mando. Hoy vive en este navegador (localStorage);
 * toda la app pasa por estas funciones, así que cambiar a una base de datos
 * (Turso) es reemplazar este archivo, no las pantallas.
 */
const KEY = "wso.hq.v1";
let cache: HqState | null = null;
const listeners = new Set<() => void>();

function read(): HqState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = HqStateSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    // Nunca se pierde lo guardado: se aparta la copia que no se pudo leer.
    window.localStorage.setItem(`${KEY}.corrupto`, raw);
  } catch {
    /* sin acceso a localStorage: se trabaja en memoria */
  }
  return defaultState();
}

function getSnapshot(): HqState {
  if (!cache) cache = read();
  return cache;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = read();
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function commit(next: HqState) {
  cache = HqStateSchema.parse(next);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* almacenamiento lleno o bloqueado: el cambio queda en memoria */
  }
  listeners.forEach((l) => l());
}

/** Estado actual, o null mientras carga (y en el servidor). */
export function useHq(): HqState | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

const patchDay = (date: string, patch: Partial<DayLog>) => {
  const s = getSnapshot();
  commit({ ...s, days: { ...s.days, [date]: { ...dayOf(s, date), ...patch } } });
};

export const actions = {
  setTraining: (date: string, done: boolean) => patchDay(date, { trainingDone: done }),
  setClip: (date: string, done: boolean) => patchDay(date, { clipDone: done }),
  setWeight: (date: string, kg: number | null) => patchDay(date, { weightKg: kg }),
  setFeeling: (date: string, feeling: Feeling | null) => patchDay(date, { feeling }),
  addMeal(date: string, meal: Omit<Meal, "id" | "at">) {
    const full = MealSchema.parse({ ...meal, id: Math.random().toString(36).slice(2, 10), at: new Date().toISOString() });
    patchDay(date, { meals: [...dayOf(getSnapshot(), date).meals, full] });
  },
  removeMeal: (date: string, id: string) => patchDay(date, { meals: dayOf(getSnapshot(), date).meals.filter((m) => m.id !== id) }),
  setPlan: (plan: Plan | null) => commit({ ...getSnapshot(), plan }),
  updateProfile: (patch: Partial<Profile>) => commit({ ...getSnapshot(), profile: { ...getSnapshot().profile, ...patch } }),
  setAccessKey: (accessKey: string) => commit({ ...getSnapshot(), accessKey }),
  /** Respaldo sin la clave de acceso. */
  exportJson: () => JSON.stringify({ ...getSnapshot(), accessKey: "" }, null, 2),
  importJson(text: string): { ok: true } | { ok: false; message: string } {
    try {
      const parsed = HqStateSchema.safeParse(JSON.parse(text));
      if (!parsed.success) return { ok: false, message: "El archivo no tiene el formato de un respaldo de WhiteShadow." };
      commit({ ...parsed.data, accessKey: getSnapshot().accessKey });
      return { ok: true };
    } catch {
      return { ok: false, message: "El archivo no es un JSON válido." };
    }
  },
  reset: () => commit({ ...defaultState(), accessKey: getSnapshot().accessKey }),
};

/** Acepta "87,4" o "87.4". */
export function parseNumber(text: string): number | null {
  const n = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(n) ? n : null;
}
