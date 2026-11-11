"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TranscriptSchema, type Transcript } from "@/engine/schemas/transcript";
import * as C from "@/crew/logic";
import { deleteJob, getRepo, saveJob, useJobs } from "@/crew/repo";
import { runCopy, runCrew } from "@/crew/runner";
import { BriefSchema, type Brief, type Platform, type ReviewClip, type StageId, type StageState, type StreamJob } from "@/crew/schemas";
import type { HqState } from "@/hq/schemas";
import { useHq } from "@/hq/store";
import { useToday } from "@/hq/useToday";
import { MascotFace } from "../hq/Mascot";
import { btn, Card, H2, Icon, input, Loading, PageTitle } from "../hq/ui";

export function Studio() {
  const hq = useHq();
  const today = useToday();
  const jobs = useJobs();
  if (!hq || !today || !jobs) return <Loading />;
  return <StudioView hq={hq} today={today} jobs={jobs} />;
}

type Pending = { fileName: string; transcript: Transcript | null; demo: boolean };

export function StudioView({ hq, today, jobs }: { hq: HqState; today: string; jobs: StreamJob[] }) {
  const angle = C.contentAngle(hq, today);
  const [selected, setSelected] = useState<string | null>(jobs[0]?.id ?? null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const job = jobs.find((j) => j.id === selected) ?? jobs[0] ?? null;

  async function onFile(file: File | undefined) {
    setErr(null);
    if (!file) return;
    if (file.size > 60_000_000) return setErr("El archivo pesa demasiado (máx. 60 MB). Usa el transcript.json que genera el pipeline.");
    try {
      const parsed = TranscriptSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) return setErr("Ese JSON no es una transcripción de WhiteShadow. Usa out/<video>/transcript.json del pipeline.");
      setPending({ fileName: file.name, transcript: parsed.data, demo: false });
    } catch {
      setErr("No pude leer el archivo como JSON.");
    }
  }

  async function launch(brief: Brief) {
    if (!pending) return;
    const t = pending.transcript;
    const base = (t?.sourceId ?? "demo").replace(/[^\w-]+/g, "-").slice(0, 40) || "job";
    const id = `${base}-${Date.now().toString(36)}`;
    const job = C.newJob({
      id, now: new Date().toISOString(), fileName: pending.fileName, sourceId: t?.sourceId ?? "demo-stream",
      durationSec: t?.durationSec ?? 2400, segments: t?.segments.length ?? 400, hasWords: t ? t.segments.some((s) => (s.words?.length ?? 0) > 0) : false,
      brief, angle: angle.line, demo: pending.demo,
    });
    await saveJob(job);
    if (t) await getRepo().putTranscript(id, t).catch(() => {});
    setPending(null);
    setSelected(id);
    void runCrew(job, t, hq.accessKey);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Estudio de shorts" sub="Stream Crew · 6 agentes" />

      <section aria-label="Plan de ataque de hoy" className="glass flex items-start gap-3 rounded-3xl p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent"><Icon name="target" size={20} /></span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-accent">Agente 6 · Plan de ataque</p>
          <p className="text-[15px] leading-snug">{angle.line}</p>
          <p className="mt-1 text-[12px] text-mute">Tono sugerido: {C.TONES.find((t) => t.value === angle.tone)?.label}. Se usa como contexto del Miner y del Copywriter.</p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <section
          aria-label="Nuevo trabajo"
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void onFile(e.dataTransfer.files[0]); }}
          className={`glass flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed p-6 text-center transition-colors ${drag ? "border-accent bg-accent/10" : "border-transparent"}`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-well text-accent"><Icon name="upload" size={22} /></span>
          <div>
            <p className="text-[17px] font-semibold">Arrastra la transcripción de tu stream</p>
            <p className="text-[13px] text-mute">El <code className="rounded bg-well px-1">transcript.json</code> que deja <code className="rounded bg-well px-1">npm run pipeline</code> en <code className="rounded bg-well px-1">out/&lt;video&gt;/</code>. El video nunca se sube.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className={btn.primary} onClick={() => fileRef.current?.click()}>Elegir archivo</button>
            <button type="button" className={btn.ghost} onClick={() => setPending({ fileName: "demo-stream.json", transcript: null, demo: true })}>Probar con demo</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Transcripción JSON" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          {err && <p role="alert" className="text-sm text-amber">{err}</p>}
        </section>

        <section aria-labelledby="jobs-h" className="glass flex flex-col gap-2 rounded-3xl p-4">
          <h2 id="jobs-h" className="px-1 text-[13px] font-semibold uppercase tracking-wide text-mute">Trabajos</h2>
          {jobs.length === 0 && <p className="px-1 text-sm text-mute">Aún no hay trabajos. Empieza con la demo para ver el flujo completo.</p>}
          <ul className="flex flex-col gap-1">
            {jobs.slice(0, 8).map((j) => (
              <li key={j.id}>
                <button type="button" onClick={() => setSelected(j.id)} aria-current={job?.id === j.id ? "true" : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ${job?.id === j.id ? "bg-accent/15" : "hover:bg-well"}`}>
                  <StatusDot status={j.status} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{j.title}{j.demo ? " (demo)" : ""}</span>
                    <span className="block text-[12px] text-mute">{JOB_LABEL[j.status]} · {j.clips.length} clips</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {job && <JobDetail key={job.id} job={job} hq={hq} />}
      {pending && <Briefing pending={pending} angle={angle} name={hq.profile.mascotName} onCancel={() => setPending(null)} onLaunch={(b) => void launch(b)} />}
    </div>
  );
}

const JOB_LABEL: Record<StreamJob["status"], string> = { running: "Trabajando", review: "Por revisar", approved: "Aprobado", failed: "Se detuvo" };
function StatusDot({ status }: { status: StreamJob["status"] }) {
  const c = status === "running" ? "bg-sky wso-pulse" : status === "review" ? "bg-amber" : status === "approved" ? "bg-accent" : "bg-danger";
  return <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${c}`} />;
}

// --- Agente 0: briefing ------------------------------------------------------------------
function Briefing({ pending, angle, name, onCancel, onLaunch }: { pending: Pending; angle: C.Angle; name: string; onCancel: () => void; onLaunch: (b: Brief) => void }) {
  const [b, setB] = useState<Brief>(BriefSchema.parse({ tone: angle.tone }));
  const [launching, setLaunching] = useState(false);
  const minutes = pending.transcript ? Math.round(pending.transcript.durationSec / 60) : 40;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-labelledby="brief-h">
      <button type="button" aria-label="Cancelar" className="wso-fade absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onCancel} />
      <form
        onSubmit={(e) => { e.preventDefault(); setLaunching(true); setTimeout(() => onLaunch(BriefSchema.parse(b)), 380); }}
        className="glass glass-strong wso-sheet relative flex max-h-[92dvh] w-full max-w-lg flex-col gap-5 overflow-y-auto rounded-t-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl md:rounded-[28px]"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-end justify-center rounded-2xl bg-accent/12"><MascotFace mood="listo" size={46} /></span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-accent">Agente 0 · Briefing</p>
            <h2 id="brief-h" className="text-[20px] font-semibold leading-tight tracking-tight">Antes de soltar al Crew, 3 preguntas</h2>
            <p className="truncate text-[13px] text-mute">{pending.demo ? "Demo: transcripción inventada, sin gastar tu API" : `${pending.fileName} · ${minutes} min`}</p>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[15px] font-semibold">1. ¿Cuál fue el momento más explosivo del stream?</span>
          <textarea className={`${input} min-h-20 py-2.5`} maxLength={240} value={b.highlight} onChange={(e) => setB({ ...b, highlight: e.target.value })}
            placeholder="Ej. cuando expliqué por qué dejé WordPress, o la parte del gym a las 5 am" />
          <span className="text-[12px] text-mute">Opcional, pero el Miner acierta mucho más si se lo dices.</span>
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[15px] font-semibold">2. ¿Con qué tono escribe el Copywriter?</legend>
          <Segmented value={b.tone} onChange={(tone) => setB({ ...b, tone })} options={C.TONES.map((t) => ({ value: t.value, label: t.label }))} />
          <span className="text-[12px] text-mute">{C.TONES.find((t) => t.value === b.tone)?.hint}{b.tone === angle.tone ? " · sugerido por el Plan de ataque" : ""}</span>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[15px] font-semibold">3. ¿Cuántos clips y de qué duración?</legend>
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-full bg-well p-1">
              <button type="button" aria-label="Menos clips" className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-semibold disabled:opacity-30" disabled={b.clipCount <= 1} onClick={() => setB({ ...b, clipCount: b.clipCount - 1 })}>−</button>
              <span aria-live="polite" className="w-16 text-center text-[15px] font-semibold">{b.clipCount} clip{b.clipCount === 1 ? "" : "s"}</span>
              <button type="button" aria-label="Más clips" className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-semibold disabled:opacity-30" disabled={b.clipCount >= 8} onClick={() => setB({ ...b, clipCount: b.clipCount + 1 })}>+</button>
            </div>
          </div>
          <Segmented value={b.length} onChange={(length) => setB({ ...b, length })} options={(Object.keys(C.LENGTHS) as Brief["length"][]).map((k) => ({ value: k, label: C.LENGTHS[k].label }))} />
          <span className="text-[12px] text-mute">Tus videos retienen mejor en 20–25 s: “corto” es lo recomendado.</span>
        </fieldset>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={btn.chip} onClick={onCancel}>Cancelar</button>
          <button type="submit" disabled={launching} className={`${btn.primary} ${launching ? "wso-launch" : ""}`}>
            <Icon name="rocket" size={18} />{launching ? "Despegando…" : "Lanzar Crew"}
          </button>
        </div>
        <p className="sr-only" aria-live="polite">{launching ? `${name} lanzó al Crew` : ""}</p>
      </form>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="radiogroup" className="grid auto-cols-fr grid-flow-col rounded-[10px] bg-well p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`min-h-9 rounded-[8px] px-2 text-[13px] font-semibold ${value === o.value ? "bg-white/[0.12] text-fg shadow-sm" : "text-mute"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// --- detalle del trabajo: monitor + revisión ---------------------------------------------------
function JobDetail({ job, hq }: { job: StreamJob; hq: HqState }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function retry(stage: StageId) {
    const t = job.demo ? null : await getRepo().getTranscript(job.id).catch(() => null);
    if (stage === "miner") void runCrew(job, t, hq.accessKey);
    else if (stage === "copy") void runCopy(job, hq.accessKey);
  }
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="mon-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <H2 id="mon-h">Pipeline en vivo</H2>
          <div className="flex items-center gap-3 text-[13px] text-mute">
            <span>{job.demo ? "Demo · sin costo" : `${tokensOf(job).toLocaleString("es-MX")} tokens`}</span>
            {confirmDelete ? (
              <span className="flex items-center gap-2">
                <button type="button" className="font-semibold text-danger" onClick={() => void deleteJob(job.id)}>Sí, borrar</button>
                <button type="button" onClick={() => setConfirmDelete(false)}>No</button>
              </span>
            ) : <button type="button" className="hover:text-fg" onClick={() => setConfirmDelete(true)}>Borrar trabajo</button>}
          </div>
        </div>
        {job.error && <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-[14px] text-danger">{job.error}</p>}
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {C.STAGES.map((s, i) => (
            <StageCard key={s.id} n={s.n} name={s.name} role={s.role} state={job.stages[s.id]} last={i === C.STAGES.length - 1}
              onRetry={(s.id === "miner" || s.id === "copy") && job.stages[s.id]?.status === "failed" ? () => void retry(s.id) : undefined} />
          ))}
        </ol>
      </section>
      {job.clips.length > 0 && <Review job={job} />}
    </div>
  );
}

const tokensOf = (j: StreamJob) => Object.values(j.stages).reduce((n, s) => n + s.inputTokens + s.outputTokens, 0);

const STAGE_PILL: Record<StageState["status"], { label: string; cls: string }> = {
  pending: { label: "En fila", cls: "bg-well text-mute" },
  running: { label: "Trabajando", cls: "bg-sky/15 text-sky" },
  done: { label: "Listo", cls: "bg-accent/15 text-accent" },
  failed: { label: "Falló", cls: "bg-danger/15 text-danger" },
  waiting: { label: "Te espera", cls: "bg-amber/15 text-amber" },
  local: { label: "En tu compu", cls: "bg-well text-fg" },
};

function StageCard({ n, name, role, state, onRetry }: { n: number; name: string; role: string; state?: StageState; last: boolean; onRetry?: () => void }) {
  const s = state ?? { status: "pending" as const, pct: 0, detail: "", log: [], inputTokens: 0, outputTokens: 0, startedAt: null, endedAt: null };
  const pill = STAGE_PILL[s.status];
  const running = s.status === "running";
  return (
    <li className={`glass flex flex-col gap-2.5 rounded-3xl p-4 ${running ? "ring-1 ring-sky/40" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-display text-[14px] font-bold ${s.status === "done" ? "bg-accent text-ink" : "bg-well text-fg"}`}>
            {s.status === "done" ? <Icon name="check" size={16} strokeWidth={3} /> : n}
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold leading-tight">{name}</span>
            <span className="block truncate text-[12px] text-mute">{role}</span>
          </span>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${pill.cls}`}>{pill.label}</span>
      </div>
      <div role="progressbar" aria-label={`Avance de ${name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.pct)} className="h-1.5 overflow-hidden rounded-full bg-edge/40">
        <div className={`h-full rounded-full transition-[width] duration-500 ${s.status === "failed" ? "bg-danger" : s.status === "done" ? "bg-accent" : "bg-sky"} ${running ? "wso-shimmer" : ""}`} style={{ width: `${Math.max(s.pct, running ? 6 : 0)}%` }} />
      </div>
      <p className="min-h-[1.25rem] text-[13px] leading-snug text-fg/85">{s.detail || "—"}</p>
      <div className="flex items-center justify-between gap-2 text-[12px] text-mute">
        <span>{s.inputTokens + s.outputTokens > 0 ? `${(s.inputTokens + s.outputTokens).toLocaleString("es-MX")} tokens` : ""}</span>
        {onRetry && <button type="button" className="font-semibold text-accent" onClick={onRetry}>Reintentar</button>}
      </div>
      {s.log.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer select-none text-[12px] font-medium text-mute">Logs ({s.log.length})</summary>
          <pre className="mt-1.5 max-h-36 overflow-y-auto whitespace-pre-wrap rounded-xl bg-well p-2.5 font-mono text-[11px] leading-relaxed text-fg/80">{s.log.join("\n")}</pre>
        </details>
      )}
    </li>
  );
}

// --- revisión humana (HitL) -------------------------------------------------------------------
const videos = new Map<string, string>(); // jobId → object URL (solo en esta pestaña; nada se sube)

function Review({ job }: { job: StreamJob }) {
  const [idx, setIdx] = useState(0);
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [videoUrl, setVideoUrl] = useState<string | null>(videos.get(job.id) ?? null);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLInputElement>(null);
  const clip = job.clips[Math.min(idx, job.clips.length - 1)]!;
  const approvedCount = C.approved(job).length;

  const update = (patch: Partial<ReviewClip>) =>
    void saveJob({ ...job, clips: job.clips.map((c) => (c.clip.id === clip.clip.id ? { ...c, ...patch } : c)) });

  function decide(decision: ReviewClip["decision"]) {
    update({ decision });
    if (idx < job.clips.length - 1) setIdx(idx + 1);
  }

  function exportPlan() {
    const plan = C.renderPlan(job);
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${job.source.sourceId.replace(/[^\w-]+/g, "-")}.render-plan.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    void saveJob({
      ...C.withStage(job, "publisher", (s) => ({ status: "done", pct: 100, endedAt: new Date().toISOString(), detail: `Plan exportado: ${plan.clips.length} clips · publicación manual por ahora`, log: [...s.log, "Plan de render exportado"] })),
      status: "approved",
    });
  }

  async function copyTexts() {
    try {
      await navigator.clipboard.writeText(C.copyPack(job));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* sin portapapeles */
    }
  }

  return (
    <section aria-labelledby="rev-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H2 id="rev-h">Corte de montaje</H2>
        <span className="text-[13px] text-mute">{approvedCount} de {job.clips.length} aprobados · nada se publica sin tu OK</span>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {job.clips.map((c, i) => (
          <button key={c.clip.id} type="button" onClick={() => setIdx(i)} aria-current={i === idx ? "true" : undefined}
            className={`flex min-w-[9.5rem] shrink-0 flex-col items-start gap-0.5 rounded-2xl px-3 py-2 text-left ${i === idx ? "bg-accent/15 ring-1 ring-accent/40" : "glass"}`}>
            <span className="flex w-full items-center justify-between text-[11px] text-mute">
              <span>Clip {i + 1} · {Math.round(c.clip.duration)} s</span>
              <span className={c.decision === "aprobado" ? "text-accent" : c.decision === "descartado" ? "text-danger" : ""}>{c.decision === "aprobado" ? "✓" : c.decision === "descartado" ? "✕" : "•"}</span>
            </span>
            <span className="line-clamp-2 text-[13px] font-semibold leading-snug">{c.hook}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
        <div className="flex flex-col gap-3">
          <Segmented value={platform} onChange={setPlatform} options={(Object.keys(C.SAFE_ZONES) as Platform[]).map((p) => ({ value: p, label: C.SAFE_ZONES[p].label }))} />
          <Preview9x16 clip={clip} platform={platform} videoUrl={videoUrl} onCaptionY={(captionY) => update({ captionY })} />
          <div className="flex items-center justify-between gap-2 text-[12px] text-mute">
            <span>{videoUrl ? "Vista previa con tu video local" : "Sin video: muestra el texto"}</span>
            <button type="button" className="font-semibold text-accent" onClick={() => videoRef.current?.click()}>{videoUrl ? "Cambiar video" : "Ver con mi video"}</button>
            <input ref={videoRef} type="file" accept="video/*" className="sr-only" aria-label="Video original (solo vista previa local)" onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const prev = videos.get(job.id);
              if (prev) URL.revokeObjectURL(prev);
              const url = URL.createObjectURL(f);
              videos.set(job.id, url);
              setVideoUrl(url);
            }} />
          </div>
        </div>

        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-mute">
            <span>{C.fmtTime(clip.clip.startTime)}–{C.fmtTime(clip.clip.endTime)} · {clip.clip.topic} · puntaje {clip.clip.scores.final}</span>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-semibold">Gancho (primeros ~3 s, Auto-Hook)</span>
            <input className={input} maxLength={80} value={clip.hook} onChange={(e) => update({ hook: e.target.value })} />
            <span className="text-[12px] text-mute">Máx. ~8 palabras. Lo más fuerte primero: tu retención se caía en el segundo 12.</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="flex justify-between text-[14px] font-semibold"><span>Altura de subtítulos</span><span className="font-normal text-mute">{Math.round(clip.captionY * 100)} %</span></span>
            <input type="range" min={30} max={85} value={Math.round(clip.captionY * 100)} onChange={(e) => update({ captionY: Number(e.target.value) / 100 })} className="accent-[var(--accent)]" />
            {C.captionCovered(clip.captionY, platform) && <span role="status" className="text-[12px] text-amber">En {C.SAFE_ZONES[platform].label} esta altura queda debajo de los botones. Súbelos un poco.</span>}
          </label>
          <CopyEditor clip={clip} onChange={(copy) => update({ copy })} />
          <details className="text-[13px]">
            <summary className="cursor-pointer font-medium text-mute">Fragmento de la transcripción</summary>
            <p className="mt-1.5 max-h-40 overflow-y-auto rounded-xl bg-well p-3 leading-relaxed text-fg/85">{clip.clip.transcriptExcerpt}</p>
          </details>
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <button type="button" className={btn.primary} onClick={() => decide("aprobado")}><Icon name="check" size={18} strokeWidth={2.6} />Aprobar</button>
            <button type="button" className={btn.chip} onClick={() => decide("descartado")}>Descartar</button>
          </div>
        </Card>
      </div>

      <div className="glass flex flex-col gap-3 rounded-3xl p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[14px] leading-snug">
          <b>Publisher:</b> la publicación automática todavía no está conectada. Exporta el plan, renderiza en tu compu y sube con estos textos.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" className={btn.ghost} disabled={approvedCount === 0} onClick={() => void copyTexts()}><Icon name="copy" size={18} />{copied ? "¡Copiado!" : "Copiar textos"}</button>
          <button type="button" className={btn.primary} disabled={approvedCount === 0} onClick={exportPlan}><Icon name="download" size={18} />Plan de render</button>
        </div>
      </div>
      {approvedCount > 0 && (
        <pre className="overflow-x-auto rounded-2xl bg-well p-3 text-[12px] text-fg/85"><code>npm run render:plan -- &quot;C:\videos\stream.mp4&quot; out\{job.source.sourceId}\transcript.json {job.source.sourceId}.render-plan.json --layout split</code></pre>
      )}
    </section>
  );
}

function CopyEditor({ clip, onChange }: { clip: ReviewClip; onChange: (c: NonNullable<ReviewClip["copy"]>) => void }) {
  const copy = clip.copy ?? { title: "", caption: "", hashtags: [] };
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-1 text-[14px] font-semibold">Copy y SEO {clip.copy ? "" : <span className="font-normal text-mute">(el Copywriter no escribió este)</span>}</legend>
      <input aria-label="Título" className={input} maxLength={100} placeholder="Título (Shorts)" value={copy.title} onChange={(e) => onChange({ ...copy, title: e.target.value })} />
      <textarea aria-label="Descripción" className={`${input} min-h-24 py-2.5`} maxLength={600} placeholder="Descripción (TikTok / Reels)" value={copy.caption} onChange={(e) => onChange({ ...copy, caption: e.target.value })} />
      <input aria-label="Hashtags" className={input} placeholder="hashtags separados por espacio"
        value={copy.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}
        onChange={(e) => onChange({ ...copy, hashtags: e.target.value.split(/\s+/).map((h) => h.replace(/^#/, "")).filter(Boolean).slice(0, 10) })} />
    </fieldset>
  );
}

/** Cuadro 9:16 con la interfaz simulada de la red: ves qué tapan los botones antes de renderizar. */
function Preview9x16({ clip, platform, videoUrl, onCaptionY }: { clip: ReviewClip; platform: Platform; videoUrl: string | null; onCaptionY: (y: number) => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const z = C.SAFE_ZONES[platform];
  const sample = useMemo(() => clip.clip.transcriptExcerpt.split(/\s+/).filter(Boolean).slice(0, 3).join(" ").toLocaleUpperCase("es-MX") || "TUS SUBTÍTULOS", [clip.clip.transcriptExcerpt]);
  const covered = C.captionCovered(clip.captionY, platform);

  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    v.currentTime = clip.clip.startTime;
    const loop = () => { if (v.currentTime >= clip.clip.endTime) v.currentTime = clip.clip.startTime; };
    v.addEventListener("timeupdate", loop);
    return () => v.removeEventListener("timeupdate", loop);
  }, [clip.clip.startTime, clip.clip.endTime, videoUrl]);

  function drag(e: React.PointerEvent) {
    const r = frame.current?.getBoundingClientRect();
    if (!r || (e.type === "pointermove" && e.buttons !== 1)) return;
    onCaptionY(Math.min(0.85, Math.max(0.3, (e.clientY - r.top) / r.height)));
  }

  return (
    <div ref={frame} className="relative aspect-[9/16] w-full select-none overflow-hidden rounded-[28px] bg-black shadow-2xl ring-1 ring-black/10">
      {videoUrl ? (
        <video ref={vid} src={videoUrl} className="absolute inset-0 h-full w-full object-cover" muted playsInline autoPlay controls={false} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#1b2a06] via-[#0b0b0d] to-[#0a1a33] p-6">
          <p className="line-clamp-6 text-center text-[13px] leading-relaxed text-white/50">{clip.clip.transcriptExcerpt}</p>
        </div>
      )}
      {/* Auto-Hook */}
      <div className="absolute inset-x-4 flex justify-center" style={{ top: `${(z.top + 0.06) * 100}%` }}>
        <span className="rounded-xl bg-white px-3 py-1.5 text-center text-[15px] font-extrabold leading-tight text-black shadow-lg">{clip.hook || "Tu gancho aquí"}</span>
      </div>
      {/* Subtítulos (arrástralos) */}
      <div role="slider" tabIndex={0} aria-label="Altura de subtítulos" aria-valuemin={30} aria-valuemax={85} aria-valuenow={Math.round(clip.captionY * 100)}
        onKeyDown={(e) => { if (e.key === "ArrowUp") onCaptionY(Math.max(0.3, clip.captionY - 0.02)); if (e.key === "ArrowDown") onCaptionY(Math.min(0.85, clip.captionY + 0.02)); }}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag(e); }} onPointerMove={drag}
        className="absolute inset-x-6 flex -translate-y-1/2 cursor-ns-resize justify-center touch-none" style={{ top: `${clip.captionY * 100}%` }}>
        <span className={`rounded-md px-2 py-0.5 text-center text-[19px] font-black uppercase tracking-tight text-white [text-shadow:0_0_6px_#000,0_2px_0_#000] ${covered ? "outline-2 outline-dashed outline-amber" : ""}`}>
          {sample.split(" ").map((w, i) => <span key={i} className={i === 1 ? "text-[#FFD400]" : ""}>{w} </span>)}
        </span>
      </div>
      {/* Interfaz simulada de la red (genérica) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-0 right-0 top-0 flex justify-center bg-gradient-to-b from-black/40 to-transparent pt-3 text-[11px] font-semibold text-white/85" style={{ height: `${z.top * 100}%` }}>{z.label}</div>
        <div className="absolute right-2 flex flex-col items-center justify-end gap-3" style={{ top: `${z.right.top * 100}%`, bottom: `${(1 - z.right.bottom) * 100}%`, width: `${z.right.width * 100}%` }}>
          {[0, 1, 2, 3].map((i) => <span key={i} className="h-8 w-8 rounded-full bg-white/25 ring-1 ring-white/30" />)}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end gap-1.5 bg-gradient-to-t from-black/60 to-transparent px-3 pb-3" style={{ height: `${z.bottom * 100}%` }}>
          <span className="h-2.5 w-24 rounded-full bg-white/60" />
          <span className="h-2 w-40 rounded-full bg-white/35" />
        </div>
      </div>
    </div>
  );
}
