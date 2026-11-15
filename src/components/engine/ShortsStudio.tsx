"use client";

import { upload } from "@vercel/blob/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { badgeFor, isActive, MAX_CLIP_BYTES, MAX_CLIPS, STATUS_LABEL, type ShortClip, type ShortJob } from "@/engine/shorts/plan";
import { weekStart } from "@/hq/facets";
import * as L from "@/hq/logic";
import type { HqState } from "@/hq/schemas";
import { useHq } from "@/hq/store";
import { useToday } from "@/hq/useToday";
import { btn, Icon, input, Loading, PageTitle } from "../hq/ui";

type Ready = { kv: boolean; blob: boolean; dispatch: boolean };
type Picked = { id: string; file: File; url: string };

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n > 100 * 1024 * 1024 ? 0 : 1)} MB`;
const sec = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, "0")} min` : `${Math.round(n)} s`);
const safeName = (name: string) => name.normalize("NFD").replace(/[^\w.-]+/g, "-").slice(-60) || "clip.mp4";

export function ShortsPage() {
  const hq = useHq();
  const today = useToday();
  if (!hq || !today) return <Loading />;
  return <ShortsStudio hq={hq} today={today} />;
}

function ShortsStudio({ hq, today }: { hq: HqState; today: string }) {
  const [jobs, setJobs] = useState<ShortJob[]>([]);
  const [ready, setReady] = useState<Ready | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/engine/jobs", { headers: { "x-wso-key": hq.accessKey }, cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { jobs?: ShortJob[]; ready?: Ready; message?: string } | null;
      if (!res.ok) throw new Error(json?.message ?? "No se pudo cargar tus Shorts.");
      setJobs(json?.jobs ?? []);
      setReady(json?.ready ?? null);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "No se pudo cargar tus Shorts.");
    }
  }, [hq.accessKey]);

  useEffect(() => {
    // Primera carga al abrir la pantalla.
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const working = jobs.some((j) => isActive(j.status));
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [working, refresh]);

  const missing = ready ? [!ready.blob && "conectar Vercel Blob al proyecto", !ready.dispatch && "agregar GH_DISPATCH_TOKEN en Vercel", !ready.kv && "la base de datos (Upstash)"].filter(Boolean) : [];

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Motor de Shorts" sub="Sube tus clips del día y WhiteShadow los edita: vertical, subtítulos y gancho" />
      {!hq.accessKey && <p className="glass rounded-2xl p-4 text-[14px] text-amber">Pon tu clave de acceso en Yo → Ajustes para usar el motor.</p>}
      {missing.length > 0 && (
        <p className="glass rounded-2xl p-4 text-[14px] text-amber">Para que el motor arranque falta: {missing.join(", ")}.</p>
      )}
      <NewShort hq={hq} today={today} onCreated={refresh} disabled={!hq.accessKey || missing.length > 0} />
      <section aria-labelledby="mis-shorts" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="mis-shorts" className="font-display text-[20px] font-bold tracking-[-0.02em]">Tus Shorts</h2>
          <button type="button" className={btn.chip} onClick={() => void refresh()}>Actualizar</button>
        </div>
        {loadErr && <p role="status" className="text-[14px] text-amber">{loadErr}</p>}
        {jobs.length === 0 && !loadErr && <p className="text-[14px] text-mute">Todavía no hay Shorts. Sube tus primeros clips arriba.</p>}
        <ul className="flex flex-col gap-3">
          {jobs.map((j) => <JobCard key={j.id} job={j} hq={hq} onChange={refresh} />)}
        </ul>
      </section>
    </div>
  );
}

function NewShort({ hq, today, onCreated, disabled }: { hq: HqState; today: string; onCreated: () => void; disabled: boolean }) {
  const info = L.challengeInfo(hq.profile, today);
  const todayGuion = hq.contentWeek.weekOf === weekStart(today)
    ? hq.contentWeek.items.find((i) => i.format === "guion" && i.day === L.weekdayIndex(today))
    : undefined;
  const [picked, setPicked] = useState<Picked[]>([]);
  const [hook, setHook] = useState(todayGuion?.hook || "");
  const [withBadge, setWithBadge] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const badge = withBadge ? badgeFor(info.dayNumber, hq.profile.challengeDays) : "";

  useEffect(() => () => picked.forEach((p) => URL.revokeObjectURL(p.url)), [picked]);

  function add(files: FileList | null) {
    if (!files) return;
    const list = [...files].filter((f) => f.type.startsWith("video/"));
    const big = list.find((f) => f.size > MAX_CLIP_BYTES);
    if (big) setMsg(`"${big.name}" pesa ${mb(big.size)}; el máximo por clip es ${mb(MAX_CLIP_BYTES)}.`);
    const ok = list.filter((f) => f.size <= MAX_CLIP_BYTES);
    setPicked((prev) => [...prev, ...ok.map((file) => ({ id: Math.random().toString(36).slice(2), file, url: URL.createObjectURL(file) }))].slice(0, MAX_CLIPS));
  }
  const move = (i: number, d: -1 | 1) => setPicked((p) => {
    const n = [...p];
    const j = i + d;
    if (j < 0 || j >= n.length) return p;
    [n[i], n[j]] = [n[j]!, n[i]!];
    return n;
  });
  const remove = (id: string) => setPicked((p) => p.filter((x) => x.id !== id));

  async function send() {
    if (!picked.length) return;
    setBusy(true);
    setMsg(null);
    const total = picked.reduce((n, p) => n + p.file.size, 0);
    const doneBytes: number[] = picked.map(() => 0);
    try {
      const clips: ShortClip[] = [];
      for (const [i, p] of picked.entries()) {
        const blob = await upload(`shorts/raw/${today}-${safeName(p.file.name)}`, p.file, {
          access: "public",
          handleUploadUrl: "/api/engine/upload",
          clientPayload: JSON.stringify({ key: hq.accessKey }),
          multipart: p.file.size > 20 * 1024 * 1024,
          contentType: p.file.type || "video/mp4",
          onUploadProgress: (e) => {
            doneBytes[i] = e.loaded;
            setProgress(Math.round((doneBytes.reduce((a, b) => a + b, 0) / Math.max(1, total)) * 100));
          },
        });
        clips.push({ url: blob.url, pathname: blob.pathname, name: p.file.name.slice(0, 120), size: p.file.size });
      }
      const res = await fetch("/api/engine/jobs", {
        method: "POST",
        headers: { "x-wso-key": hq.accessKey, "Content-Type": "application/json" },
        body: JSON.stringify({ clips, hook: hook.trim(), badge }),
      });
      const json = (await res.json().catch(() => null)) as { job?: ShortJob; message?: string } | null;
      if (!res.ok || !json?.job) throw new Error(json?.message ?? "No se pudo crear el Short.");
      if (json.job.status === "error") setMsg(json.job.error);
      else setMsg("¡Listo! El editor ya está trabajando. Tarda unos 3–5 minutos; te lo muestro abajo cuando termine.");
      setPicked([]);
      onCreated();
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setMsg(/401|UNAUTHORIZED|incorrecta/i.test(m) ? "Clave de acceso incorrecta (Yo → Ajustes)." : m || "No se pudo subir. Revisa tu conexión e inténtalo otra vez.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <section aria-labelledby="nuevo-short" className="glass flex flex-col gap-4 rounded-[26px] p-5">
      <div>
        <h2 id="nuevo-short" className="font-display text-[20px] font-bold tracking-[-0.02em]">Nuevo Short</h2>
        <p className="text-[14px] text-mute">Hasta {MAX_CLIPS} clips, en el orden en que quieres que salgan. Se juntan en un solo video vertical con tus subtítulos.</p>
      </div>
      <input ref={fileRef} type="file" accept="video/*" multiple className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      {picked.length > 0 && (
        <ol className="flex flex-col gap-2">
          {picked.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2">
              <video src={p.url} muted playsInline preload="metadata" className="h-20 w-12 shrink-0 rounded-lg bg-black object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold"><span className="tnum text-mute">{i + 1}.</span> {p.file.name}</p>
                <p className="text-[12px] text-mute">{mb(p.file.size)}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" aria-label="Subir" disabled={i === 0 || busy} onClick={() => move(i, -1)} className="h-10 w-10 rounded-xl bg-white/[0.06] disabled:opacity-30">↑</button>
                <button type="button" aria-label="Bajar" disabled={i === picked.length - 1 || busy} onClick={() => move(i, 1)} className="h-10 w-10 rounded-xl bg-white/[0.06] disabled:opacity-30">↓</button>
                <button type="button" aria-label="Quitar" disabled={busy} onClick={() => remove(p.id)} className="h-10 w-10 rounded-xl bg-white/[0.06] text-rose disabled:opacity-30">✕</button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {picked.length < MAX_CLIPS && (
        <button type="button" className={btn.ghost} disabled={busy || disabled} onClick={() => fileRef.current?.click()}>
          <Icon name="plus" size={16} />{picked.length ? "Agregar otro clip" : "Elegir clips"}
        </button>
      )}
      <label className="flex flex-col gap-1.5 text-[13px] text-mute">
        Gancho (texto grande los primeros 3 segundos)
        <input className={input} value={hook} maxLength={80} onChange={(e) => setHook(e.target.value)} placeholder={todayGuion?.title ? `Ej. ${todayGuion.title.slice(0, 60)}` : "Ej. Reinicié mi reto: Día 1 otra vez"} />
      </label>
      {badgeFor(info.dayNumber, hq.profile.challengeDays) && (
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={withBadge} onChange={(e) => setWithBadge(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
          Poner &ldquo;{badgeFor(info.dayNumber, hq.profile.challengeDays)}&rdquo; arriba
        </label>
      )}
      <button type="button" className={btn.primary} disabled={!picked.length || busy || disabled} onClick={() => void send()}>
        <Icon name="sparkle" size={16} />{busy ? (progress !== null ? `Subiendo… ${progress}%` : "Preparando…") : "Editar con WhiteShadow"}
      </button>
      {msg && <p role="status" className="text-[14px] text-fg/85">{msg}</p>}
    </section>
  );
}

function JobCard({ job, hq, onChange }: { job: ShortJob; hq: HqState; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const tone = job.status === "ready" ? "bg-lime/15 text-lime" : job.status === "approved" ? "bg-sky/15 text-sky" : job.status === "error" ? "bg-rose/15 text-rose" : "bg-iris/15 text-iris";

  async function act(action: "approve" | "discard" | "retry") {
    setBusy(true);
    try {
      const res = await fetch(`/api/engine/jobs/${job.id}`, { method: "PATCH", headers: { "x-wso-key": hq.accessKey, "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const json = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) setNote(json?.message ?? "No se pudo.");
      onChange();
    } finally {
      setBusy(false);
    }
  }

  /** Descarga o comparte el video (en el celular abre el menú para mandarlo a TikTok). */
  async function share() {
    if (!job.result) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(job.result.url);
      const file = new File([await res.blob()], `short-${job.id}.mp4`, { type: "video/mp4" });
      const text = [job.hook, job.badge && `#${job.badge.replace(/\s+/g, "")}`, "#reto60dias #gym #disciplina"].filter(Boolean).join(" ");
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
        try { await navigator.clipboard.writeText(text); setNote("Descargado. El texto para la publicación quedó copiado."); } catch { setNote("Descargado."); }
      }
      if (job.status === "ready") await act("approve");
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setNote("No se pudo compartir. Prueba descargarlo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="glass flex flex-col gap-3 rounded-[22px] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${tone}`}>{STATUS_LABEL[job.status]}</span>
        <span className="text-[12px] text-mute">{new Date(job.createdAt).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {job.clips.length} clip{job.clips.length === 1 ? "" : "s"}</span>
        {job.result && <span className="text-[12px] text-mute">· {sec(job.result.durationSec)}</span>}
      </div>
      {job.hook && <p className="text-[15px] font-semibold">{job.hook}</p>}
      {isActive(job.status) && (
        <p role="status" className="flex items-center gap-2 text-[14px] text-iris"><span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-iris" />{job.stage || "En cola"}…</p>
      )}
      {job.status === "error" && <p className="text-[14px] text-rose">{job.error}</p>}
      {job.result && (job.status === "ready" || job.status === "approved") && (
        <video src={job.result.url} controls playsInline preload="metadata" className="mx-auto aspect-[9/16] max-h-[70vh] w-full max-w-[340px] rounded-2xl bg-black" />
      )}
      {job.transcript && <details className="text-[13px] text-mute"><summary className="cursor-pointer">Lo que dijiste</summary><p className="mt-1 leading-relaxed">{job.transcript}</p></details>}
      <div className="flex flex-wrap gap-2">
        {job.result && (job.status === "ready" || job.status === "approved") && (
          <button type="button" className={btn.primary} disabled={busy} onClick={() => void share()}>
            <Icon name="check" size={16} />{job.status === "ready" ? "Me gusta: publicar" : "Compartir otra vez"}
          </button>
        )}
        {job.status === "error" && !job.result && <button type="button" className={btn.ghost} disabled={busy} onClick={() => void act("retry")}>Reintentar</button>}
        {!isActive(job.status) && <button type="button" className={btn.chip} disabled={busy} onClick={() => void act("discard")}>Descartar</button>}
      </div>
      {note && <p role="status" className="text-[13px] text-mute">{note}</p>}
    </li>
  );
}
