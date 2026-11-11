"use client";

import { useSyncExternalStore } from "react";
import { toDateStr } from "./logic";

function subscribe(cb: () => void) {
  const id = window.setInterval(cb, 60_000);
  document.addEventListener("visibilitychange", cb);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", cb);
  };
}

/** Fecha local de hoy (AAAA-MM-DD); se actualiza sola al cambiar de día. Null en el servidor. */
export function useToday(): string | null {
  return useSyncExternalStore(subscribe, () => toDateStr(new Date()), () => null);
}

/** Hora local (0–23). Null en el servidor. */
export function useHour(): number | null {
  return useSyncExternalStore(subscribe, () => new Date().getHours(), () => null);
}
