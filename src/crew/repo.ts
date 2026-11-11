"use client";

import { useSyncExternalStore } from "react";
import type { Transcript } from "@/engine/schemas/transcript";
import { StreamJobSchema, type StreamJob } from "./schemas";

/**
 * Capa de repositorio del Stream Crew. Las pantallas solo conocen `JobRepository`;
 * hoy la implementación es IndexedDB (aguanta transcripciones de horas, a diferencia de
 * localStorage con ~5 MB). Migrar a Supabase/Firestore = otra clase con esta interfaz.
 */
export interface JobRepository {
  list(): Promise<StreamJob[]>;
  put(job: StreamJob): Promise<void>;
  remove(id: string): Promise<void>;
  putTranscript(id: string, t: Transcript): Promise<void>;
  getTranscript(id: string): Promise<Transcript | null>;
}

const DB = "wso-crew";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("jobs")) db.createObjectStore("jobs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("transcripts")) db.createObjectStore("transcripts");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        t.oncomplete = () => {
          db.close();
          resolve(req ? req.result : undefined);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
}

export class IndexedDbJobRepository implements JobRepository {
  async list() {
    const raw = ((await tx<unknown[]>("jobs", "readonly", (s) => s.getAll())) ?? []) as unknown[];
    // Lo que no pase el esquema (versiones viejas, datos rotos) se ignora en vez de romper la pantalla.
    return raw.flatMap((r) => {
      const p = StreamJobSchema.safeParse(r);
      return p.success ? [p.data] : [];
    }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  async put(job: StreamJob) {
    await tx("jobs", "readwrite", (s) => s.put(StreamJobSchema.parse(job)));
  }
  async remove(id: string) {
    await tx("jobs", "readwrite", (s) => s.delete(id));
    await tx("transcripts", "readwrite", (s) => s.delete(id));
  }
  async putTranscript(id: string, t: Transcript) {
    await tx("transcripts", "readwrite", (s) => s.put(t, id));
  }
  async getTranscript(id: string) {
    return ((await tx<Transcript>("transcripts", "readonly", (s) => s.get(id))) ?? null) as Transcript | null;
  }
}

/** Respaldo en memoria (modo privado sin IndexedDB, pruebas). */
export class MemoryJobRepository implements JobRepository {
  private jobs = new Map<string, StreamJob>();
  private transcripts = new Map<string, Transcript>();
  async list() { return [...this.jobs.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); }
  async put(job: StreamJob) { this.jobs.set(job.id, StreamJobSchema.parse(job)); }
  async remove(id: string) { this.jobs.delete(id); this.transcripts.delete(id); }
  async putTranscript(id: string, t: Transcript) { this.transcripts.set(id, t); }
  async getTranscript(id: string) { return this.transcripts.get(id) ?? null; }
}

let repo: JobRepository | null = null;
export const getRepo = (): JobRepository => (repo ??= typeof indexedDB === "undefined" ? new MemoryJobRepository() : new IndexedDbJobRepository());

// --- estado en vivo para React -------------------------------------------------------------
let jobs: StreamJob[] | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function load() {
  try {
    jobs = await getRepo().list();
  } catch {
    repo = new MemoryJobRepository();
    jobs = [];
  }
  emit();
}

/** Lista de trabajos (null mientras carga). */
export function useJobs(): StreamJob[] | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      if (jobs === null) void load();
      return () => listeners.delete(cb);
    },
    () => jobs,
    () => null,
  );
}

/** Guarda y actualiza la pantalla al instante; la escritura a disco va detrás. */
export async function saveJob(job: StreamJob) {
  jobs = [job, ...(jobs ?? []).filter((j) => j.id !== job.id)].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  emit();
  try {
    await getRepo().put(job);
  } catch {
    /* si falla el disco, el trabajo sigue en memoria esta sesión */
  }
}

export async function deleteJob(id: string) {
  jobs = (jobs ?? []).filter((j) => j.id !== id);
  emit();
  await getRepo().remove(id).catch(() => {});
}

export const currentJob = (id: string) => jobs?.find((j) => j.id === id) ?? null;
