"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CaptureSchema, sortCaptures, type Capture, type CaptureKind } from "./journal";

/**
 * Guardado de la Bitácora en IndexedDB (las imágenes no caben en localStorage).
 * Tres almacenes: metadatos, imagen completa (máx. 1600 px) y miniatura (480 px).
 */
const DB = "wso-journal";
const META = "captures";
const FULL = "full";
const THUMB = "thumb";

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore(META, { keyPath: "id" });
      d.createObjectStore(FULL);
      d.createObjectStore(THUMB);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(stores: string[], mode: IDBTransactionMode, run: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction(stores, mode);
        const req = run(t);
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

// --- store externo para React ------------------------------------------------------
let cache: Capture[] | null = null;
let loading = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function load() {
  if (loading) return;
  loading = true;
  try {
    const all = (await tx<unknown[]>([META], "readonly", (t) => t.objectStore(META).getAll())) ?? [];
    cache = sortCaptures(all.flatMap((x) => {
      const p = CaptureSchema.safeParse(x);
      return p.success ? [p.data] : [];
    }));
  } catch {
    cache = []; // navegador sin IndexedDB (modo privado viejo): bitácora vacía
  }
  loading = false;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (cache === null) void load();
  return () => listeners.delete(cb);
}

/** Capturas (más nuevas primero), o null mientras carga y en el servidor. */
export function useCaptures(): Capture[] | null {
  return useSyncExternalStore(subscribe, () => cache, () => null);
}

// --- imágenes ----------------------------------------------------------------------
async function resize(file: Blob, maxSide: number, quality: number) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  if (!blob) throw new Error("encode");
  return { blob, w, h };
}

const urls = new Map<string, string>();

/** URL local de la miniatura o de la imagen completa (se cachea mientras la app está abierta). */
export async function imageUrl(id: string, size: "thumb" | "full"): Promise<string | null> {
  const key = `${size}:${id}`;
  const hit = urls.get(key);
  if (hit) return hit;
  const blob = await tx<Blob>([size === "thumb" ? THUMB : FULL], "readonly", (t) => t.objectStore(size === "thumb" ? THUMB : FULL).get(id));
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  return url;
}

export function useImageUrl(id: string | null, size: "thumb" | "full"): string | null {
  const [url, setUrl] = useState<string | null>(() => (id ? (urls.get(`${size}:${id}`) ?? null) : null));
  useEffect(() => {
    let alive = true;
    if (!id) return;
    imageUrl(id, size).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [id, size]);
  return id ? url : null;
}

export const journal = {
  async add(file: Blob, meta: { date: string; kind: CaptureKind; note: string }): Promise<Capture> {
    const full = await resize(file, 1600, 0.85);
    const thumb = await resize(full.blob, 480, 0.78);
    const capture = CaptureSchema.parse({
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      date: meta.date,
      kind: meta.kind,
      note: meta.note,
      createdAt: new Date().toISOString(),
      w: full.w,
      h: full.h,
    });
    await tx([META, FULL, THUMB], "readwrite", (t) => {
      t.objectStore(META).put(capture);
      t.objectStore(FULL).put(full.blob, capture.id);
      t.objectStore(THUMB).put(thumb.blob, capture.id);
    });
    cache = sortCaptures([capture, ...(cache ?? [])]);
    emit();
    return capture;
  },
  async update(id: string, patch: Partial<Pick<Capture, "note" | "kind" | "date">>) {
    const cur = cache?.find((c) => c.id === id);
    if (!cur) return;
    const next = CaptureSchema.parse({ ...cur, ...patch });
    await tx([META], "readwrite", (t) => {
      t.objectStore(META).put(next);
    });
    cache = sortCaptures((cache ?? []).map((c) => (c.id === id ? next : c)));
    emit();
  },
  async remove(id: string) {
    await tx([META, FULL, THUMB], "readwrite", (t) => {
      t.objectStore(META).delete(id);
      t.objectStore(FULL).delete(id);
      t.objectStore(THUMB).delete(id);
    });
    for (const size of ["thumb", "full"]) {
      const key = `${size}:${id}`;
      const u = urls.get(key);
      if (u) URL.revokeObjectURL(u);
      urls.delete(key);
    }
    cache = (cache ?? []).filter((c) => c.id !== id);
    emit();
  },
};
