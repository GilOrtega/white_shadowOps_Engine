"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { callAgent } from "@/hq/client";
import * as C from "@/hq/content";
import { weekStart } from "@/hq/facets";
import * as L from "@/hq/logic";
import type { ContentFormat, ContentItem, HqState } from "@/hq/schemas";
import { actions, useHq } from "@/hq/store";
import { useToday } from "@/hq/useToday";
import { Fold } from "../hq/Fold";
import { GhostGlyph } from "../hq/GhostDock";
import { btn, Icon, input, Loading, PageTitle } from "../hq/ui";

export function ContentWeekPage() {
  const hq = useHq();
  const today = useToday();
  if (!hq || !today) return <Loading />;
  return <ContentWeekView hq={hq} today={today} />;
}

const TONE: Record<ContentFormat, { pill: string; border: string; text: string }> = {
  guion: { pill: "bg-amber text-ink", border: "border-amber/70", text: "text-amber" },
  carrusel: { pill: "bg-sky text-ink", border: "border-sky/70", text: "text-sky" },
  historia: { pill: "bg-rose text-ink", border: "border-rose/70", text: "text-rose" },
};

const shortDate = (date: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(L.parseDate(date));

export function ContentWeekView({ hq, today }: { hq: HqState; today: string }) {
  const week = weekStart(today);
  const cw = hq.contentWeek;
  const stale = cw.items.length > 0 && cw.weekOf !== week;
  const stats = C.weekStats(cw.items);
  const todayIdx = L.weekdayIndex(today);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = cw.items.find((i) => i.id === openId) ?? null;

  async function generate() {
    setConfirm(false);
    setBusy(true);
    setMsg(null);
    const res = await callAgent<C.AgentWeek>("/api/agents/content", { context: C.contentContext(hq, week) }, hq.accessKey);
    if (res.ok) {
      actions.setContentWeek(week, C.fromAgent(res.data));
      setMsg("Listo: tu semana está armada. Toca cualquier casilla para ver el guion completo.");
    } else {
      setMsg(`${res.message} Mientras, puedes usar la plantilla rápida.`);
    }
    setBusy(false);
  }
  const starter = () => {
    setConfirm(false);
    actions.setContentWeek(week, C.starterWeek(cw.pillars));
    setMsg("Plantilla lista. Edita cada casilla con tu idea o pídele al agente que la llene.");
  };

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Semana de contenido" sub={cw.items.length && !stale
        ? `Semana del ${shortDate(week)} · ${stats.listo} de ${stats.total} listos · ${stats.publicado} publicados`
        : "Toda tu semana desde el celular: guion, carrusel e historia por día"} />

      <div className="flex flex-wrap items-center gap-2">
        {cw.items.length > 0 && !confirm ? (
          <>
            <button type="button" className={btn.ai} disabled={busy} onClick={() => setConfirm(true)}>
              <Icon name="sparkle" size={16} />{busy ? "El agente de Marca está armando tu semana…" : stale ? "Planear esta semana con IA" : "Rehacer con IA"}
            </button>
            <button type="button" className={btn.ghost} disabled={busy} onClick={() => setConfirm(true)}>Plantilla nueva</button>
          </>
        ) : cw.items.length > 0 ? (
          <div role="alertdialog" aria-label="Reemplazar la semana" className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3">
            <span className="text-sm">Se reemplazan las 21 casillas{stats.listo ? ` (tienes ${stats.listo} listas)` : ""}.</span>
            <button type="button" className={btn.ai} onClick={() => void generate()}><Icon name="sparkle" size={16} />Con IA</button>
            <button type="button" className={btn.ghost} onClick={starter}>Con plantilla</button>
            <button type="button" className={btn.chip} onClick={() => setConfirm(false)}>Cancelar</button>
          </div>
        ) : (
          <>
            <button type="button" className={btn.ai} disabled={busy} onClick={() => void generate()}>
              <Icon name="sparkle" size={16} />{busy ? "El agente de Marca está armando tu semana…" : "Armar mi semana con IA"}
            </button>
            <button type="button" className={btn.ghost} disabled={busy} onClick={starter}>Plantilla rápida (sin IA)</button>
          </>
        )}
      </div>
      {msg && <p role="status" className="text-sm text-mute">{msg}</p>}
      {stale && <p className="text-sm text-amber">Este plan es de la semana del {shortDate(cw.weekOf!)}. Puedes seguir usándolo o planear la nueva.</p>}

      {cw.items.length === 0 ? (
        <EmptyGrid />
      ) : (
        <section aria-label="Tu semana" className="glass rounded-[26px] p-3 sm:p-5">
          <div className="grid grid-cols-[44px_repeat(3,minmax(0,1fr))] gap-2 sm:grid-cols-[64px_repeat(3,minmax(0,1fr))] sm:gap-3">
            <span />
            {C.FORMATS.map((f) => (
              <span key={f.id} className={`rounded-lg py-1.5 text-center text-[11px] font-extrabold tracking-[0.12em] sm:text-[13px] ${TONE[f.id].pill}`}>{f.label.toUpperCase()}</span>
            ))}
            {C.DAYS.map((d, day) => (
              <Row key={d} label={d} day={day} isToday={!stale && day === todayIdx} items={cw.items} hq={hq} onOpen={setOpenId} />
            ))}
          </div>
        </section>
      )}

      <Fold id="temas" title="Tus temas" tone="text-iris" summary={cw.pillars.join(" · ") || "Sin temas"}>
        <Pillars pillars={cw.pillars} />
      </Fold>

      <p className="text-xs text-mute">¿Ya grabaste el video? Súbelo al <Link href="/crew" className="font-semibold text-iris">Estudio de shorts</Link> para que el Crew lo corte y le ponga subtítulos.</p>

      {open && <Detail item={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Row({ label, day, isToday, items, hq, onOpen }: { label: string; day: number; isToday: boolean; items: ContentItem[]; hq: HqState; onOpen: (id: string) => void }) {
  return (
    <>
      <span className={`flex items-center justify-center rounded-xl text-[12px] font-bold sm:text-[14px] ${isToday ? "bg-lime text-ink" : "bg-white/[0.05] text-mute"}`}>{label}</span>
      {C.FORMATS.map((f) => {
        const it = C.cell(items, day, f.id);
        return it ? <Tile key={f.id} item={it} hq={hq} onOpen={() => onOpen(it.id)} /> : <span key={f.id} className="min-h-24 rounded-xl border border-dashed border-white/10" />;
      })}
    </>
  );
}

function Tile({ item, hq, onOpen }: { item: ContentItem; hq: HqState; onOpen: () => void }) {
  const t = TONE[item.format];
  const done = item.status === "publicado";
  const label = `${C.DAYS[item.day]}, ${item.format}: ${item.title}. Estado: ${item.status}`;
  const badge = item.status !== "idea" && (
    <span aria-hidden="true" className={`absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full ${done ? "bg-lime text-ink" : "bg-white/80 text-ink"}`}>
      {done ? <Icon name="check" size={12} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-ink" />}
    </span>
  );
  const base = `relative flex min-h-24 w-full flex-col overflow-hidden rounded-xl border-2 text-left transition-transform active:scale-[0.97] sm:min-h-28 ${t.border} ${done ? "opacity-60" : ""}`;

  if (item.format === "carrusel") {
    return (
      <button type="button" aria-label={label} onClick={onOpen} className={`${base} bg-[#f3eee4] p-2 sm:p-2.5`}>
        <span className="line-clamp-4 font-display text-[12px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[#141414] sm:text-[15px]">{item.hook || item.title}</span>
        <span className="mt-auto pt-1 text-[10px] font-semibold text-[#141414]/55">{item.beats.length} láminas</span>
        {badge}
      </button>
    );
  }
  if (item.format === "historia") {
    return (
      <button type="button" aria-label={label} onClick={onOpen} className={`${base} items-center justify-center gap-1.5 bg-black/30 p-2`}>
        <span className="rounded-full bg-gradient-to-tr from-amber via-rose to-iris p-[3px]">
          <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-panel-solid ring-2 ring-panel-solid sm:h-16 sm:w-16">
            {hq.profile.photo
              // eslint-disable-next-line @next/next/no-img-element -- foto local en data URL
              ? <img src={hq.profile.photo} alt="" className="h-full w-full object-cover" />
              : <GhostGlyph size={28} />}
          </span>
        </span>
        <span className="line-clamp-2 text-center text-[10px] leading-tight text-mute sm:text-[12px]">{item.title}</span>
        {badge}
      </button>
    );
  }
  return (
    <button type="button" aria-label={label} onClick={onOpen} className={`${base} bg-black/30 p-2 sm:p-2.5`}>
      <span className="line-clamp-4 text-[12px] font-bold leading-snug sm:text-[14px]">{item.title}</span>
      <span aria-hidden="true" className="mt-auto flex gap-0.5 pt-2">
        {["idea", "listo", "publicado"].map((s, n) => (
          <span key={s} className={`h-1 flex-1 rounded-full ${n <= ["idea", "listo", "publicado"].indexOf(item.status) ? "bg-amber" : "bg-white/10"}`} />
        ))}
      </span>
      {badge}
    </button>
  );
}

function EmptyGrid() {
  return (
    <section aria-label="Tu semana (vacía)" className="glass flex flex-col items-center gap-3 rounded-[26px] p-8 text-center">
      <Icon name="calendar" size={36} />
      <p className="max-w-md text-[15px] text-fg/85">Siete días, tres formatos: un video, un carrusel y una historia por día. El agente de Marca la arma con tus temas, tu reto y lo que ya publicaste. Tú solo grabas.</p>
    </section>
  );
}

const STATUS: { id: ContentItem["status"]; label: string }[] = [
  { id: "idea", label: "Idea" },
  { id: "listo", label: "Listo para grabar" },
  { id: "publicado", label: "Publicado" },
];

function Detail({ item, onClose }: { item: ContentItem; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const f = C.FORMATS.find((x) => x.id === item.format)!;
  const [draft, setDraft] = useState({ title: item.title, hook: item.hook, beats: item.beats.join("\n"), cta: item.cta });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const save = () => {
    const title = draft.title.trim();
    if (title) actions.updateContentItem(item.id, { title, hook: draft.hook.trim(), beats: draft.beats.split("\n").map((b) => b.trim()).filter(Boolean).slice(0, 10), cta: draft.cta.trim() });
  };
  const close = () => {
    save();
    onClose();
  };

  return (
    <dialog ref={ref} aria-labelledby="det-h" onClose={close} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      className="m-auto w-[min(560px,calc(100vw-1.5rem))] rounded-[24px] border border-white/10 bg-panel-solid p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm">
      <div className="flex max-h-[85dvh] flex-col gap-4 overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-[12px] font-extrabold tracking-[0.12em] ${TONE[item.format].text}`}>{f.label.toUpperCase()} · {C.DAYS[item.day]}</p>
            <p className="text-[13px] text-mute">{f.what}{item.pillar ? ` · ${item.pillar}` : ""}</p>
          </div>
          <button type="button" aria-label="Cerrar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06]" onClick={() => ref.current?.close()}><Icon name="x" size={18} /></button>
        </div>
        <label className="flex flex-col gap-1 text-xs text-mute"><span id="det-h">Título</span>
          <input className={`${input} font-semibold`} value={draft.title} maxLength={90} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-mute">{item.format === "historia" ? "Sticker (pregunta o encuesta)" : item.format === "carrusel" ? "Portada" : "Gancho (primeros 3 segundos)"}
          <input className={input} value={draft.hook} maxLength={200} onChange={(e) => setDraft({ ...draft, hook: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-mute">{f.beatsLabel} (una por línea)
          <textarea className={`${input} min-h-36 py-2.5 leading-relaxed`} value={draft.beats} onChange={(e) => setDraft({ ...draft, beats: e.target.value })} />
        </label>
        {item.format !== "historia" && (
          <label className="flex flex-col gap-1 text-xs text-mute">Cierre
            <input className={input} value={draft.cta} maxLength={140} onChange={(e) => setDraft({ ...draft, cta: e.target.value })} />
          </label>
        )}
        <div role="group" aria-label="Estado" className="flex flex-wrap gap-2">
          {STATUS.map((s) => (
            <button key={s.id} type="button" aria-pressed={item.status === s.id} onClick={() => { save(); actions.updateContentItem(item.id, { status: s.id }); }}
              className={`${btn.chip} ${item.status === s.id ? "border-lime/60 bg-lime/15 text-lime" : ""}`}>{s.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <button type="button" className={btn.primary} onClick={() => ref.current?.close()}>Guardar</button>
          <button type="button" className={btn.ghost} onClick={async () => {
            save();
            try {
              await navigator.clipboard.writeText(C.asText({ ...item, title: draft.title, hook: draft.hook, beats: draft.beats.split("\n").filter(Boolean), cta: draft.cta }));
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}><Icon name="copy" size={16} />{copied ? "Copiado" : "Copiar texto"}</button>
        </div>
      </div>
    </dialog>
  );
}

function Pillars({ pillars }: { pillars: string[] }) {
  const [text, setText] = useState("");
  return (
    <div className="glass flex flex-col gap-3 rounded-[20px] p-4">
      <p className="text-sm text-fg/85">De esto hablas siempre. El agente reparte la semana entre estos temas.</p>
      <ul className="flex flex-wrap gap-2">
        {pillars.map((p) => (
          <li key={p} className="flex items-center gap-1 rounded-full bg-iris/15 py-1 pr-1 pl-3 text-[14px]">
            {p}
            <button type="button" aria-label={`Quitar ${p}`} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10" onClick={() => actions.setPillars(pillars.filter((x) => x !== p))}><Icon name="x" size={14} /></button>
          </li>
        ))}
      </ul>
      {pillars.length < 6 && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim().length >= 2) { actions.setPillars([...pillars, text]); setText(""); } }}>
          <input aria-label="Nuevo tema" className={input} placeholder="Ej. Clientes y freelance" value={text} maxLength={60} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className={btn.ghost}>Agregar</button>
        </form>
      )}
    </div>
  );
}
