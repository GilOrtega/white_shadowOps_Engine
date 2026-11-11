"use client";

import { useEffect, useRef } from "react";
import { snapshotOf } from "./push";
import type { HqState } from "./schemas";
import { setUiPrefs, useUiPrefs } from "./ui-prefs";

/** Lado navegador de los avisos: permiso, suscripción y el resumen del día. */
export type PushSupport = "ok" | "no-soporta" | "ios-instalar" | "bloqueado";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "no-soporta";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // En iPhone solo funciona con la app agregada a la pantalla de inicio (iOS 16.4+).
  if (ios && !standalone) return "ios-instalar";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "no-soporta";
  if (Notification.permission === "denied") return "bloqueado";
  return "ok";
}

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Hermosillo";

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Res = { ok: true } | { ok: false; message: string };

async function post(path: string, accessKey: string, body?: unknown, method = "POST"): Promise<Res> {
  try {
    const res = await fetch(path, { method, headers: { "Content-Type": "application/json", "x-wso-key": accessKey }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.ok) return { ok: true };
    const j = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
    return { ok: false, message: j?.code === "UNAUTHORIZED" ? "La clave de acceso no coincide (Ajustes → Agentes con IA)." : j?.message ?? "El servidor no respondió." };
  } catch {
    return { ok: false, message: "Sin conexión." };
  }
}

export async function enablePush(hq: HqState, today: string): Promise<Res> {
  const support = pushSupport();
  if (support === "ios-instalar") return { ok: false, message: "En iPhone: Compartir → Agregar a inicio, abre WhiteShadow desde ahí y actívalos." };
  if (support === "bloqueado") return { ok: false, message: "Los avisos están bloqueados para este sitio. Actívalos en los ajustes del navegador." };
  if (support !== "ok") return { ok: false, message: "Este navegador no soporta avisos push." };
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid) return { ok: false, message: "Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY en el servidor (npm run push:keys)." };
  if (!hq.accessKey) return { ok: false, message: "Primero pon tu clave de acceso en Ajustes → Agentes con IA." };

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, message: "Sin permiso no te puedo avisar." };
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapid) }));
  const res = await post("/api/push/subscribe", hq.accessKey, { subscription: sub.toJSON(), snapshot: snapshotOf(hq, today, tz()) });
  if (res.ok) setUiPrefs({ push: true });
  return res;
}

export async function disablePush(hq: HqState): Promise<Res> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration("/sw.js");
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    /* ya no estaba */
  }
  setUiPrefs({ push: false });
  return hq.accessKey ? post("/api/push/subscribe", hq.accessKey, undefined, "DELETE") : { ok: true };
}

export const testPush = (hq: HqState) => post("/api/push/test", hq.accessKey);

/** Con los avisos activos, manda el resumen del día cuando cambia (máx. cada 4 s). */
export function usePushSync(hq: HqState | null, today: string | null) {
  const { push } = useUiPrefs();
  const last = useRef("");
  useEffect(() => {
    if (!push || !hq || !today || !hq.accessKey) return;
    const snap = snapshotOf(hq, today, tz());
    const key = JSON.stringify(snap);
    if (key === last.current) return;
    const id = window.setTimeout(() => {
      last.current = key;
      void post("/api/push/state", hq.accessKey, snap);
    }, 4000);
    return () => window.clearTimeout(id);
  }, [push, hq, today]);
}
