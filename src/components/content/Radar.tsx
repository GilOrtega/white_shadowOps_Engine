"use client";

import { useEffect, useState } from "react";
import { callAgent } from "@/hq/client";
import * as C from "@/hq/content";
import { weekStart } from "@/hq/facets";
import type { RadarIdea, RadarSource } from "@/hq/radar";
import * as T from "@/hq/trends";
import type { HqState } from "@/hq/schemas";
import { actions, useHq } from "@/hq/store";
import { useToday } from "@/hq/useToday";
import { btn, Icon, input, Loading } from "../hq/ui";

const FORMAT: Record<RadarIdea["format"], { label: string; cls: string }> = {
  guion: { label: "Guion", cls: "bg-amber/15 text-amber" },
  carrusel: { label: "Carrusel", cls: "bg-sky/15 text-sky" },
  historia: { label: "Historia", cls: "bg-rose/15 text-rose" },
};
const STEPS = ["Buscando en la web…", "Leyendo lo que está funcionando…", "Separando lo bueno de lo saturado…", "Armando tus ideas…"];

const domain = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
const ago = (iso: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export function RadarPage() {
  const hq = useHq();
  const today = useToday();
  if (!hq || !today) return <Loading />;
  return <RadarPanel hq={hq} today={today} />;
}

export function RadarPanel({ hq, today }: { hq: HqState; today: string }) {
  const r = hq.radar;
  const [niche, setNiche] = useState(r.niche || hq.contentWeek.pillars.join(", "));
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [picked, setPicked] = useState<T.TopicId[]>([]);
  const toggleTopic = (id: T.TopicId) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(next);
    if (next.length) setNiche(T.nicheFrom(next));
  };

  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => setStep((n) => Math.min(n + 1, STEPS.length - 1)), 12000);
    return () => window.clearInterval(t);
  }, [busy]);

  async function scan() {
    const n = niche.trim();
    if (n.length < 3) return setMsg("Escribe tu nicho: por ejemplo “gym, programación con IA y disciplina”.");
    setBusy(true);
    setStep(0);
    setMsg(null);
    actions.setRadarNiche(n);
    const res = await callAgent<{ ideas: RadarIdea[]; sources: RadarSource[] }>("/api/agents/radar", { niche: n, pillars: hq.contentWeek.pillars, today }, hq.accessKey);
    if (res.ok) {
      actions.setRadar(n, res.data.ideas, new Date().toISOString());
      setMsg(`${res.data.ideas.length} ideas de ${res.data.sources.length} fuentes. Las más fuertes van primero.`);
    } else {
      setMsg(res.message);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="radar-h" className="glass flex flex-col gap-3 rounded-[26px] p-5">
        <div>
          <h2 id="radar-h" className="font-display text-[20px] font-bold tracking-[-0.02em]">Radar del nicho</h2>
          <p className="text-[14px] text-mute">Busca en la web qué está funcionando en tu nicho y te deja las mejores ideas, cada una con su fuente y cómo la harías tú.</p>
        </div>
        <div role="group" aria-label="Temas" className="flex flex-wrap gap-2">
          {T.TOPICS.map((t) => {
            const on = picked.includes(t.id);
            return (
              <button key={t.id} type="button" aria-pressed={on} onClick={() => toggleTopic(t.id)}
                className={`flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold transition-colors ${on ? "bg-iris text-ink" : "bg-white/[0.06] text-fg/85 hover:bg-white/[0.1]"}`}>
                <span aria-hidden="true">{t.emoji}</span>{t.label}
              </button>
            );
          })}
        </div>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void scan(); }}>
          <label className="sr-only" htmlFor="radar-niche">Tu nicho</label>
          <input id="radar-niche" className={`${input} min-h-11 flex-1`} value={niche} maxLength={140} onChange={(e) => setNiche(e.target.value)} placeholder="Ej. gym, programación con IA y disciplina" />
          <button type="submit" className={btn.ai} disabled={busy}><Icon name="sparkle" size={16} />{busy ? "Buscando…" : r.ideas.length ? "Buscar de nuevo" : "Buscar ideas"}</button>
        </form>
        {busy && (
          <div role="status" className="flex items-center gap-3 rounded-xl bg-iris/10 px-3 py-2.5 text-[14px] text-iris">
            <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-iris" />{STEPS[step]} <span className="text-mute">(tarda menos de un minuto)</span>
          </div>
        )}
        {msg && !busy && <p role="status" className="text-[13px] text-mute">{msg}</p>}
        {r.ranAt && !busy && <p className="text-[12px] text-mute">Última búsqueda: {ago(r.ranAt)} · “{r.niche}”</p>}
      </section>

      <YouTubeRising hq={hq} />

      {r.ideas.length === 0 && !busy ? (
        <section className="glass flex flex-col items-center gap-2 rounded-[26px] p-8 text-center">
          <Icon name="search" size={32} />
          <p className="max-w-md text-[15px] text-fg/85">Aún no hay ideas. Escribe tu nicho y dale a “Buscar ideas”: el agente revisa publicaciones y tendencias recientes y te trae lo mejor.</p>
          <p className="max-w-md text-[12px] text-mute">Busca en la web abierta (notas, YouTube, blogs, Reddit). TikTok e Instagram no dejan leer sus publicaciones desde afuera.</p>
        </section>
      ) : (
        <ol className="flex flex-col gap-3">
          {r.ideas.map((idea, i) => <IdeaCard key={idea.id} idea={idea} n={i + 1} hq={hq} today={today} used={r.used.includes(idea.id)} />)}
        </ol>
      )}
    </div>
  );
}

/** Hora de la carga (se usa en un manejador, no al dibujar). */
const stamp = () => Date.now();

type YtState = { topic: T.TopicId; loading: boolean; videos: T.TrendVideo[] | null; error: string | null; at: number };

/** Videos que van en ascenso en YouTube México, por tema, ordenados por vistas por hora. */
function YouTubeRising({ hq }: { hq: HqState }) {
  const [st, setSt] = useState<YtState>({ topic: "gym", loading: false, videos: null, error: null, at: 0 });
  const [onlyShorts, setOnlyShorts] = useState(false);
  async function load(topic: T.TopicId) {
    setSt({ topic, loading: true, videos: null, error: null, at: 0 });
    try {
      const res = await fetch(`/api/trends/youtube?topic=${topic}`, { headers: { "x-wso-key": hq.accessKey }, cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { videos?: T.TrendVideo[]; message?: string } | null;
      if (!res.ok) throw new Error(json?.message ?? "No se pudo cargar YouTube.");
      setSt({ topic, loading: false, videos: json?.videos ?? [], error: null, at: stamp() });
    } catch (e) {
      setSt({ topic, loading: false, videos: null, error: e instanceof Error ? e.message : "No se pudo cargar YouTube.", at: 0 });
    }
  }
  const list = (st.videos ?? []).filter((v) => !onlyShorts || v.isShort);
  const now = st.at;
  return (
    <section aria-labelledby="yt-h" className="glass flex flex-col gap-3 rounded-[26px] p-5">
      <div>
        <h2 id="yt-h" className="font-display text-[20px] font-bold tracking-[-0.02em]">En ascenso en YouTube</h2>
        <p className="text-[14px] text-mute">Videos de México de los últimos días que más rápido están juntando vistas. Ordenados por vistas por hora, no por total.</p>
      </div>
      <div role="tablist" aria-label="Tema" className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {T.TOPICS.map((t) => {
          const on = st.topic === t.id && (st.videos !== null || st.loading);
          return (
            <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => void load(t.id)}
              className={`flex min-h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold ${on ? "bg-white/[0.16] text-fg" : "bg-white/[0.05] text-mute hover:text-fg"}`}>
              <span aria-hidden="true">{t.emoji}</span>{t.label}
            </button>
          );
        })}
      </div>
      <label className="flex min-h-9 items-center gap-2 self-start text-[13px] text-mute">
        <input type="checkbox" checked={onlyShorts} onChange={(e) => setOnlyShorts(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />Solo Shorts
      </label>
      {st.loading && <p role="status" className="text-[14px] text-iris">Buscando lo que va subiendo…</p>}
      {st.error && <p role="status" className="text-[14px] text-amber">{st.error}</p>}
      {!st.loading && st.videos === null && !st.error && <p className="text-[14px] text-mute">Elige un tema para ver qué está subiendo.</p>}
      {st.videos && list.length === 0 && <p className="text-[14px] text-mute">No hay {onlyShorts ? "Shorts" : "videos"} en ascenso en este tema ahorita.</p>}
      {list.length > 0 && (
        <ol className="flex flex-col gap-2">
          {list.map((v, i) => <RisingRow key={v.id} v={v} n={i + 1} now={now} topic={st.topic} />)}
        </ol>
      )}
      <p className="text-[11px] text-mute/70">Datos de YouTube Data API. Se actualizan cada 3 horas.</p>
    </section>
  );
}

function RisingRow({ v, n, now, topic }: { v: T.TrendVideo; n: number; now: number; topic: T.TopicId }) {
  const [saved, setSaved] = useState(false);
  const t = T.topicById(topic)!;
  const use = () => {
    actions.addRadarIdea({
      id: Math.random().toString(36).slice(2, 10),
      title: `Mi versión de: ${v.title}`.slice(0, 100),
      why: `Va en ascenso en YouTube México: ${T.fmtCount(v.perHour)} vistas por hora (${T.fmtCount(v.views)} en total, ${T.ago(v.publishedAt, now)}).`.slice(0, 260),
      how: "Toma el mismo ángulo y cuéntalo con tu reto de 60 días, tu código o tu día real. No copies: responde, opina o hazlo en tu contexto.",
      hook: "",
      format: v.isShort ? "guion" : "carrusel",
      pillar: t.label,
      strength: "alta",
      sources: [{ title: v.title.slice(0, 200), url: v.url, age: T.ago(v.publishedAt, now) }],
    });
    setSaved(true);
  };
  return (
    <li className="flex gap-3 rounded-2xl bg-white/[0.03] p-2.5">
      <a href={v.url} target="_blank" rel="noopener noreferrer" className="relative shrink-0 self-start" aria-label={`Ver en YouTube: ${v.title}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- miniatura remota de YouTube */}
        <img src={v.thumb} alt="" width={128} height={72} loading="lazy" className="h-[72px] w-32 rounded-lg bg-black/40 object-cover" />
        {v.isShort && <span className="absolute bottom-1 left-1 rounded bg-rose px-1.5 text-[10px] font-bold text-ink">SHORT</span>}
      </a>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <a href={v.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-[14px] font-semibold leading-snug hover:underline">
          <span className="mr-1 tnum text-mute">#{n}</span>{v.title}
        </a>
        <p className="truncate text-[12px] text-mute">{v.channel} · {T.ago(v.publishedAt, now)}</p>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="rounded-full bg-lime/15 px-2 py-0.5 font-semibold text-lime tnum">↑ {T.fmtCount(v.perHour)}/h</span>
          <span className="tnum text-fg/75">{T.fmtCount(v.views)} vistas</span>
          <button type="button" onClick={use} disabled={saved} className="ml-auto min-h-8 rounded-full bg-white/[0.08] px-3 font-semibold hover:bg-white/[0.14] disabled:opacity-60">
            {saved ? "En tus ideas ✓" : "Usar de idea"}
          </button>
        </div>
      </div>
    </li>
  );
}

function IdeaCard({ idea, n, hq, today, used }: { idea: RadarIdea; n: number; hq: HqState; today: string; used: boolean }) {
  const [picking, setPicking] = useState(false);
  const f = FORMAT[idea.format];
  const place = (day: number) => {
    const week = weekStart(today);
    actions.placeContent(week, { day, format: idea.format, title: idea.title.slice(0, 90), hook: idea.hook, beats: [idea.how, ...idea.sources.map((s) => `Referencia: ${s.url}`)].slice(0, 10).map((b) => b.slice(0, 240)), cta: "", pillar: idea.pillar }, () => C.starterWeek(hq.contentWeek.pillars));
    actions.markRadarUsed(idea.id);
    setPicking(false);
  };
  return (
    <li className="glass flex flex-col gap-3 rounded-[22px] p-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
        <span className="tnum text-mute">#{n}</span>
        <span className={`rounded-full px-2.5 py-0.5 ${f.cls}`}>{f.label}</span>
        {idea.strength === "alta" && <span className="rounded-full bg-lime/15 px-2.5 py-0.5 text-lime">🔥 Fuerte</span>}
        {idea.pillar && <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-mute">{idea.pillar}</span>}
        {used && <span className="ml-auto rounded-full bg-mint/15 px-2.5 py-0.5 text-mint">En tu semana ✓</span>}
      </div>
      <h3 className="font-display text-[18px] font-bold leading-snug tracking-[-0.02em]">{idea.title}</h3>
      {idea.hook && <p className="rounded-xl bg-black/25 px-3 py-2 text-[14px]"><span className="text-mute">Gancho:</span> “{idea.hook}”</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <p className="text-[14px] leading-snug"><span className="block text-[11px] font-semibold uppercase tracking-wide text-mute">Por qué funciona</span>{idea.why}</p>
        <p className="text-[14px] leading-snug"><span className="block text-[11px] font-semibold uppercase tracking-wide text-mute">Tu versión</span>{idea.how}</p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {idea.sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-[18rem] items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1.5 text-[12px] text-mute hover:text-fg" title={s.title}>
              <span className="truncate"><b className="font-semibold text-fg/85">{domain(s.url)}</b> · {s.title}</span>
              <Icon name="arrow" size={12} />
            </a>
          </li>
        ))}
      </ul>
      {picking ? (
        <div className="flex flex-col gap-2 rounded-xl bg-black/25 p-3">
          <p className="text-[13px] text-mute">¿Qué día? Va en la columna de {f.label.toLowerCase()} y reemplaza lo que haya ahí.</p>
          <div className="flex flex-wrap gap-1.5">
            {C.DAYS.map((d, i) => <button key={d} type="button" onClick={() => place(i)} className="min-h-10 min-w-12 rounded-xl bg-white/[0.08] px-3 text-[13px] font-semibold hover:bg-lime/20 hover:text-lime">{d}</button>)}
            <button type="button" className={btn.chip} onClick={() => setPicking(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn.primary} onClick={() => setPicking(true)}><Icon name="calendar" size={16} />{used ? "Mandar a otro día" : "A mi semana"}</button>
          <button type="button" className={btn.ghost} onClick={() => actions.dismissRadarIdea(idea.id)}>Descartar</button>
        </div>
      )}
    </li>
  );
}
