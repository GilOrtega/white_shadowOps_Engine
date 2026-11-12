"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { HqState } from "./schemas";
import { adoptCloud, currentState, localUpdatedAt } from "./store";

/**
 * Sincroniza este dispositivo con la nube: al abrir trae lo más nuevo; al cambiar algo
 * lo sube a los 2 s. Sin clave o sin Upstash, la app sigue funcionando local.
 */
export type SyncStatus = { kind: "off" | "syncing" | "ok" | "error"; at: number | null; message: string };
let status: SyncStatus = { kind: "off", at: null, message: "Sin sincronizar" };
const subs = new Set<() => void>();
const set = (s: SyncStatus) => {
  status = s;
  subs.forEach((f) => f());
};
export const useSyncStatus = () => useSyncExternalStore((cb) => (subs.add(cb), () => subs.delete(cb)), () => status, () => status);

const deviceId = () => {
  try {
    let id = localStorage.getItem("wso.device");
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      localStorage.setItem("wso.device", id);
    }
    return id;
  } catch {
    return "anon";
  }
};

async function call(method: "GET" | "PUT", key: string, body?: unknown) {
  const res = await fetch("/api/sync", { method, headers: { "Content-Type": "application/json", "x-wso-key": key }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = (await res.json().catch(() => null)) as { cloud?: { state: HqState; updatedAt: number } | null; code?: string; message?: string } | null;
  return { status: res.status, json };
}

export async function pullNow(key: string) {
  set({ ...status, kind: "syncing" });
  try {
    const r = await call("GET", key);
    if (r.status !== 200) return set({ kind: r.status === 503 ? "off" : "error", at: null, message: r.json?.message ?? "No se pudo sincronizar" });
    const cloud = r.json?.cloud;
    if (cloud && cloud.updatedAt > localUpdatedAt()) adoptCloud(cloud.state, cloud.updatedAt);
    else if (localUpdatedAt() > (cloud?.updatedAt ?? 0)) await pushNow(key);
    set({ kind: "ok", at: Date.now(), message: "Sincronizado" });
  } catch {
    set({ kind: "error", at: null, message: "Sin conexión: guardado en este dispositivo" });
  }
}

export async function pushNow(key: string) {
  try {
    const r = await call("PUT", key, { state: currentState(), updatedAt: localUpdatedAt() || Date.now(), device: deviceId() });
    if (r.status === 409 && r.json?.cloud) adoptCloud(r.json.cloud.state, r.json.cloud.updatedAt);
    else if (r.status !== 200) return set({ kind: r.status === 503 ? "off" : "error", at: null, message: r.json?.message ?? "No se pudo subir" });
    set({ kind: "ok", at: Date.now(), message: "Sincronizado" });
  } catch {
    set({ kind: "error", at: null, message: "Sin conexión: se sube al volver" });
  }
}

export function useCloudSync(hq: HqState | null) {
  const pulled = useRef(false);
  const key = hq?.accessKey ?? "";
  // Al abrir (y al volver a la pestaña): trae lo más nuevo.
  useEffect(() => {
    if (!key || process.env.WSO_STATIC) return;
    if (!pulled.current) {
      pulled.current = true;
      void pullNow(key);
    }
    const onFocus = () => document.visibilityState === "visible" && void pullNow(key);
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [key]);
  // Al cambiar algo: sube a los 2 s.
  useEffect(() => {
    if (!key || !hq || !pulled.current || process.env.WSO_STATIC) return;
    const id = window.setTimeout(() => void pushNow(key), 2000);
    return () => window.clearTimeout(id);
  }, [hq, key]);
}
