"use client";

import { useEffect, useState } from "react";
import { callAgent } from "@/hq/client";
import * as C from "@/hq/content";
import { weekStart } from "@/hq/facets";
import type { RadarIdea, RadarSource } from "@/hq/radar";
import type { HqState } from "@/hq/schemas";
import { actions } from "@/hq/store";
import { btn, Icon, input } from "../hq/ui";

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

export function RadarPanel({ hq, today }: { hq: HqState; today: string }) {
  const r = hq.radar;
  const [niche, setNiche] = useState(r.niche || hq.contentWeek.pillars.join(", "));
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

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
