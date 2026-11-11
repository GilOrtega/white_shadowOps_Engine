"use client";

import type { Transcript } from "@/engine/schemas/transcript";
import { callAgent } from "@/hq/client";
import { setGhostActivity } from "@/hq/ui-prefs";
import { templateCopy, type CopyResponse } from "./copywriter";
import { minerOptionsFor, toReview, withStage } from "./logic";
import { currentJob, saveJob } from "./repo";
import type { MineEvent, StreamJob } from "./schemas";

/**
 * Orquestador del Crew en el navegador: Miner (SSE) → Editor/Auto-Hook → Copywriter.
 * Cada paso guarda el trabajo, así que si recargas ves dónde se quedó y puedes reintentar.
 */
const now = () => new Date().toISOString();
const latest = (job: StreamJob) => currentJob(job.id) ?? job;

async function commit(job: StreamJob, f: (j: StreamJob) => StreamJob): Promise<StreamJob> {
  const next = f(latest(job));
  await saveJob(next);
  return next;
}

/** La transcripción sin palabras sueltas: el Miner solo necesita frases (≈10× menos peso). */
export const slimTranscript = (t: Transcript): Transcript => ({ ...t, segments: t.segments.map((s) => ({ id: s.id, start: s.start, end: s.end, text: s.text, ...(s.speaker ? { speaker: s.speaker } : {}) })) });

async function* readSse(res: Response): AsyncGenerator<MineEvent> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) {
        try {
          yield JSON.parse(line.slice(6)) as MineEvent;
        } catch {
          /* evento roto: se ignora */
        }
      }
    }
  }
}

export async function runMiner(job: StreamJob, transcript: Transcript | null, accessKey: string): Promise<StreamJob> {
  let j = await commit(job, (x) => ({ ...withStage(x, "miner", { status: "running", pct: 2, detail: "Conectando…", startedAt: now(), endedAt: null, log: ["Enviando transcripción al Miner"] }), status: "running", error: null }));
  setGhostActivity({ kind: "pensando", label: "El Miner está buscando tus mejores momentos…" });

  const fail = async (message: string) => {
    setGhostActivity(null);
    return commit(j, (x) => ({ ...withStage(x, "miner", (s) => ({ status: "failed", detail: message, endedAt: now(), log: [...s.log, `✖ ${message}`] })), status: "failed", error: message }));
  };

  if (process.env.WSO_STATIC) return fail("En la versión sin servidor el Miner no corre. Ábrelo desde Vercel.");
  if (!job.demo && !transcript) return fail("No encontré la transcripción guardada de este trabajo. Vuelve a importarla.");

  let res: Response;
  try {
    res = await fetch("/api/engine/mine/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-wso-key": accessKey },
      body: JSON.stringify(job.demo ? { demo: true, options: minerOptionsFor(job.brief, job.angle) } : { transcript: slimTranscript(transcript!), options: minerOptionsFor(job.brief, job.angle) }),
    });
  } catch {
    return fail("Sin conexión con el servidor.");
  }
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
    return fail(json?.code === "UNAUTHORIZED" ? "La clave de acceso no coincide. Revísala en Ajustes." : json?.code === "NOT_CONFIGURED" ? "El Miner no está activado en el servidor (faltan ANTHROPIC_API_KEY y WSO_API_SECRET)." : json?.message ?? "El Miner no respondió.");
  }

  for await (const e of readSse(res)) {
    if (e.type === "start") {
      j = await commit(j, (x) => withStage(x, "miner", (s) => ({ pct: 5, detail: `0 de ${e.windows} ventanas`, log: [...s.log, `${e.segments} segmentos en ${e.windows} ventana${e.windows === 1 ? "" : "s"}`] })));
    } else if (e.type === "window") {
      j = await commit(j, (x) => withStage(x, "miner", (s) => ({
        pct: Math.round(5 + (e.done / e.total) * 90),
        detail: `${e.done} de ${e.total} ventanas`,
        inputTokens: s.inputTokens + e.inputTokens,
        outputTokens: s.outputTokens + e.outputTokens,
        log: [...s.log, e.error ? `Ventana ${e.index + 1}: falló (${e.error}), sigo con las demás` : `Ventana ${e.index + 1}: ${e.candidates} candidato${e.candidates === 1 ? "" : "s"}`],
      })));
    } else if (e.type === "result") {
      j = await commit(j, (x) => ({
        ...withStage(x, "miner", (s) => ({
          status: e.clips.length ? "done" : "failed", pct: 100, endedAt: now(), inputTokens: e.inputTokens, outputTokens: e.outputTokens,
          detail: e.clips.length ? `${e.clips.length} clips · ${e.dropped} descartados` : "No encontró clips con suficiente gancho",
          log: [...s.log, `✔ ${e.clips.length} clips en ${(e.elapsedMs / 1000).toFixed(1)} s`],
        })),
        clips: toReview(e.clips),
        ...(e.clips.length ? {} : { status: "failed" as const, error: "El Miner no encontró clips. Prueba con otro briefing o un stream más largo." }),
      }));
      if (!e.clips.length) setGhostActivity(null);
      return j;
    } else if (e.type === "error") {
      return fail(e.message);
    }
  }
  return fail("La conexión se cortó antes de terminar.");
}

/** Editor + Auto-Hook: prepara gancho y subtítulos para el render (el FFmpeg corre en tu compu / Cloud Run). */
export async function runEditor(job: StreamJob): Promise<StreamJob> {
  return commit(job, (x) => withStage(x, "editor", (s) => ({
    status: "local", pct: 100, startedAt: now(), endedAt: now(),
    detail: x.source.hasWords ? `${x.clips.length} ganchos listos · render en tu compu` : "Sin palabras en la transcripción: render sin subtítulos",
    log: [...s.log, ...x.clips.map((c, i) => `Clip ${i + 1}: gancho “${c.hook}”`), "Exporta el plan y corre: npm run render:plan"],
  })));
}

export async function runCopy(job: StreamJob, accessKey: string): Promise<StreamJob> {
  let j = await commit(job, (x) => withStage(x, "copy", { status: "running", pct: 15, detail: `Escribiendo ${x.clips.length} textos…`, startedAt: now(), endedAt: null }));
  setGhostActivity({ kind: "pensando", label: "El Copywriter está escribiendo tus títulos…" });

  if (j.demo) {
    j = await commit(j, (x) => ({
      ...withStage(x, "copy", (s) => ({ status: "done", pct: 100, endedAt: now(), detail: "Textos de ejemplo (demo, sin IA)", log: [...s.log, "Plantilla de demo aplicada"] })),
      clips: x.clips.map((c) => ({ ...c, copy: c.copy ?? templateCopy({ topic: c.clip.topic, hook: c.hook }, x.brief.tone) })),
    }));
  } else {
    const res = await callAgent<{ data: CopyResponse; inputTokens: number; outputTokens: number }>("/api/agents/copy", {
      tone: j.brief.tone, angle: j.angle,
      clips: j.clips.slice(0, 8).map((c) => ({ id: c.clip.id, topic: c.clip.topic, category: c.clip.category, hook: c.hook, excerpt: c.clip.transcriptExcerpt.slice(0, 1500) })),
    }, accessKey);
    if (!res.ok) {
      j = await commit(j, (x) => withStage(x, "copy", (s) => ({ status: "failed", endedAt: now(), detail: res.message, log: [...s.log, `✖ ${res.message}`] })));
    } else {
      const byId = new Map(res.data.data.clips.map((c) => [c.id, c]));
      j = await commit(j, (x) => ({
        ...withStage(x, "copy", (s) => ({ status: "done", pct: 100, endedAt: now(), inputTokens: res.data.inputTokens, outputTokens: res.data.outputTokens, detail: `${byId.size} textos listos para revisar`, log: [...s.log, `✔ ${byId.size} textos`] })),
        clips: x.clips.map((c) => {
          const got = byId.get(c.clip.id);
          return got ? { ...c, copy: { title: got.title, caption: got.caption, hashtags: got.hashtags } } : c;
        }),
      }));
    }
  }
  return j;
}

/** El Crew completo después del briefing. El Copywriter puede fallar sin tirar los clips. */
export async function runCrew(job: StreamJob, transcript: Transcript | null, accessKey: string): Promise<StreamJob> {
  let j = await runMiner(job, transcript, accessKey);
  if (j.status === "failed") return j;
  j = await runEditor(j);
  j = await runCopy(j, accessKey);
  j = await commit(j, (x) => ({ ...x, status: "review" }));
  setGhostActivity({ kind: "exito", label: `¡Listo! ${j.clips.length} clips esperan tu revisión.` });
  setTimeout(() => setGhostActivity(null), 6000);
  return j;
}
