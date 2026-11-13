"use client";

import { useSyncExternalStore } from "react";
import { dayOf } from "./logic";
import { ContentItemSchema, defaultState, HabitSchema, HqStateSchema, IncomeSchema, MealSchema, ProjectSchema, type ContentItem, type DayLog, type Habit, type Feeling, type HqState, type Meal, type Plan, type Profile } from "./schemas";

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

const META = "wso.hq.meta";
/** Cuándo cambió por última vez el estado en este dispositivo (para sincronizar). */
export function localUpdatedAt(): number {
  try {
    return Number(JSON.parse(window.localStorage.getItem(META) ?? "{}").updatedAt) || 0;
  } catch {
    return 0;
  }
}

function persist(state: HqState, updatedAt: number) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    window.localStorage.setItem(META, JSON.stringify({ updatedAt }));
  } catch {
    /* almacenamiento lleno o bloqueado: el cambio queda en memoria */
  }
}

function commit(next: HqState) {
  cache = HqStateSchema.parse(next);
  persist(cache, Date.now());
  listeners.forEach((l) => l());
}

/** Adopta la copia de la nube sin perder tu clave de acceso local. */
export function adoptCloud(state: HqState, updatedAt: number) {
  cache = HqStateSchema.parse({ ...state, accessKey: getSnapshot().accessKey });
  persist(cache, updatedAt);
  listeners.forEach((l) => l());
}

export const currentState = () => getSnapshot();

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
  setLift(date: string, id: string, patch: { kg?: number | null; setIndex?: number; reps?: number }) {
    const d = dayOf(getSnapshot(), date);
    const cur = d.lifts[id] ?? { kg: null, reps: [] };
    const reps = [...cur.reps];
    if (patch.setIndex !== undefined) {
      while (reps.length <= patch.setIndex) reps.push(0);
      reps[patch.setIndex] = Math.max(0, Math.min(300, Math.round(patch.reps ?? 0)));
    }
    patchDay(date, { lifts: { ...d.lifts, [id]: { kg: patch.kg !== undefined ? patch.kg : cur.kg, reps: reps.slice(0, 8) } } });
  },
  setClip: (date: string, done: boolean) => patchDay(date, { clipDone: done }),
  setWeight: (date: string, kg: number | null) => patchDay(date, { weightKg: kg }),
  setFeeling: (date: string, feeling: Feeling | null) => patchDay(date, { feeling }),
  addMeal(date: string, meal: Omit<Meal, "id" | "at">) {
    const full = MealSchema.parse({ ...meal, id: Math.random().toString(36).slice(2, 10), at: new Date().toISOString() });
    patchDay(date, { meals: [...dayOf(getSnapshot(), date).meals, full] });
  },
  removeMeal: (date: string, id: string) => patchDay(date, { meals: dayOf(getSnapshot(), date).meals.filter((m) => m.id !== id) }),
  setPlan: (plan: Plan | null) => commit({ ...getSnapshot(), plan }),
  // --- facetas ---
  addFocusBlock: (date: string, delta = 1) => patchDay(date, { focusBlocks: Math.max(0, Math.min(20, dayOf(getSnapshot(), date).focusBlocks + delta)) }),
  setWork: (patch: Partial<HqState["work"]>) => commit({ ...getSnapshot(), work: { ...getSnapshot().work, ...patch } }),
  addProject(p: { name: string; client: string; due: string | null }) {
    const full = ProjectSchema.parse({ ...p, id: Math.random().toString(36).slice(2, 10) });
    const s = getSnapshot();
    commit({ ...s, work: { ...s.work, projects: [...s.work.projects, full] } });
  },
  toggleProject(id: string) {
    const s = getSnapshot();
    commit({ ...s, work: { ...s.work, projects: s.work.projects.map((p) => (p.id === id ? { ...p, done: !p.done } : p)) } });
  },
  removeProject(id: string) {
    const s = getSnapshot();
    commit({ ...s, work: { ...s.work, projects: s.work.projects.filter((p) => p.id !== id) } });
  },
  setMoneyGoal: (monthlyGoal: number | null) => commit({ ...getSnapshot(), money: { ...getSnapshot().money, monthlyGoal } }),
  addIncome(e: { date: string; amount: number; note: string }) {
    const full = IncomeSchema.parse({ ...e, id: Math.random().toString(36).slice(2, 10) });
    const s = getSnapshot();
    commit({ ...s, money: { ...s.money, entries: [...s.money.entries, full].slice(-1000) } });
  },
  removeIncome(id: string) {
    const s = getSnapshot();
    commit({ ...s, money: { ...s.money, entries: s.money.entries.filter((e) => e.id !== id) } });
  },
  setWeeklyClips: (weeklyClips: number) => commit({ ...getSnapshot(), brand: { weeklyClips } }),
  // --- gym ---
  swapExercise(id: string, exerciseId: string | null) {
    const s = getSnapshot();
    const swaps = { ...s.exerciseSwaps };
    if (exerciseId) swaps[id] = exerciseId;
    else delete swaps[id];
    commit({ ...s, exerciseSwaps: swaps });
  },
  // --- semana de contenido ---
  setContentWeek(weekOf: string, items: ContentItem[]) {
    const s = getSnapshot();
    commit({ ...s, contentWeek: { ...s.contentWeek, weekOf, items: items.map((i) => ContentItemSchema.parse(i)).slice(0, 21) } });
  },
  updateContentItem(id: string, patch: Partial<Omit<ContentItem, "id" | "day" | "format">>) {
    const s = getSnapshot();
    commit({ ...s, contentWeek: { ...s.contentWeek, items: s.contentWeek.items.map((i) => (i.id === id ? ContentItemSchema.parse({ ...i, ...patch }) : i)) } });
  },
  setPillars(pillars: string[]) {
    const s = getSnapshot();
    const clean = pillars.map((p) => p.trim()).filter((p) => p.length >= 2).slice(0, 6);
    commit({ ...s, contentWeek: { ...s.contentWeek, pillars: clean } });
  },
  // --- hábitos ---
  addHabit(h: Omit<Habit, "id" | "createdAt"> & { createdAt?: string }, today: string) {
    const s = getSnapshot();
    const full = HabitSchema.parse({ ...h, id: Math.random().toString(36).slice(2, 10), createdAt: h.createdAt ?? today });
    commit({ ...s, habits: [...s.habits, full].slice(0, 24) });
  },
  updateHabit(id: string, patch: Partial<Habit>) {
    const s = getSnapshot();
    commit({ ...s, habits: s.habits.map((h) => (h.id === id ? HabitSchema.parse({ ...h, ...patch }) : h)) });
  },
  removeHabit(id: string) {
    const s = getSnapshot();
    commit({ ...s, habits: s.habits.filter((h) => h.id !== id) });
  },
  toggleHabit(date: string, id: string) {
    const done = dayOf(getSnapshot(), date).habitsDone;
    patchDay(date, { habitsDone: done.includes(id) ? done.filter((x) => x !== id) : [...done, id] });
  },
  dismiss: (insightId: string, date: string) => commit({ ...getSnapshot(), dismissed: { ...getSnapshot().dismissed, [insightId]: date } }),
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
