"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { pageTip } from "@/hq/coordinator";
import { beforeAfter, groupByWeek, KINDS, kindLabel, KindSchema, pulse, type Capture, type CaptureKind } from "@/hq/journal";
import { journal, useCaptures, useImageUrl } from "@/hq/journal-store";
import { diffDays, parseDate } from "@/hq/logic";
import type { HqState } from "@/hq/schemas";
import { useHq } from "@/hq/store";
import { useHour, useToday } from "@/hq/useToday";
import { GhostGlyph } from "./GhostDock";
import { btn, Card, H2, Icon, input, Loading, PageTitle } from "./ui";

const fmtDay = (d: string) => {
  const s = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "short" }).format(parseDate(d));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const fmtShort = (d: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(parseDate(d));

const imageFiles = (list: FileList | File[] | null | undefined) => [...(list ?? [])].filter((f) => f.type.startsWith("image/"));

// --- miniatura ---------------------------------------------------------------------
function Thumb({ c, onOpen, className = "" }: { c: Capture; onOpen?: () => void; className?: string }) {
  const url = useImageUrl(c.id, "thumb");
  const body = (
    <>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagen local (blob) de IndexedDB
        <img src={url} alt={`${kindLabel(c.kind)} del ${fmtShort(c.date)}${c.note ? `: ${c.note}` : ""}`} className="h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]" />
      ) : (
        <span className="block h-full w-full animate-pulse bg-white/[0.05]" />
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2.5 pt-6 pb-2 text-left">
        <span className="block text-[12px] font-semibold text-white">{kindLabel(c.kind)}</span>
        {c.note && <span className="block truncate text-[11px] text-white/70">{c.note}</span>}
      </span>
    </>
  );
  const cls = `group relative block overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30 ${className}`;
  return onOpen ? (
    <button type="button" onClick={onOpen} className={cls}>
      {body}
    </button>
  ) : (
    <span className={cls}>{body}</span>
  );
}

// --- subir -------------------------------------------------------------------------
function Composer({ today, hour, initialKind }: { today: string; hour: number; initialKind: CaptureKind }) {
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [kind, setKind] = useState<CaptureKind>(initialKind);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((list: File[]) => {
    if (!list.length) return;
    setMsg(null);
    setFiles((f) => [...f, ...list.slice(0, 12 - f.length).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }, []);

  // Pegar una captura con Ctrl+V / ⌘V en cualquier parte de la pantalla.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const list = imageFiles([...(e.clipboardData?.files ?? [])]);
      if (list.length) {
        e.preventDefault();
        addFiles(list);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), [files]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    addFiles(imageFiles(e.dataTransfer.files));
  };

  async function save() {
    if (!files.length || busy) return;
    if (date > today) return setMsg({ ok: false, text: "La fecha no puede ser en el futuro." });
    setBusy(true);
    let saved = 0;
    for (const f of files) {
      try {
        await journal.add(f.file, { date, kind, note: note.trim() });
        saved++;
      } catch {
        /* se reporta abajo */
      }
    }
    setBusy(false);
    setFiles([]);
    setNote("");
    setMsg(
      saved === files.length
        ? { ok: true, text: saved === 1 ? "Captura guardada en tu bitácora." : `${saved} capturas guardadas en tu bitácora.` }
        : { ok: false, text: `Se guardaron ${saved} de ${files.length}. Las demás no se pudieron leer como imagen.` },
    );
  }

  return (
    <Card aria-labelledby="new-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H2 id="new-h">Nueva captura</H2>
        <span className="text-[13px] text-mute">{hour < 12 ? "Arranca el día con una." : "Una al día basta."}</span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-4 py-8 text-center transition-colors ${
          over ? "border-iris bg-iris/10" : "border-white/15 bg-black/20"
        }`}
      >
        {files.length === 0 ? (
          <>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06] text-iris ring-1 ring-inset ring-white/10">
              <Icon name="upload" size={22} />
            </span>
            <p className="max-w-sm text-[15px] text-fg/90">Arrastra tus capturas aquí, pégalas con Ctrl+V o elígelas de tu galería.</p>
            <button type="button" className={btn.ghost} onClick={() => fileRef.current?.click()}>
              Elegir imágenes
            </button>
          </>
        ) : (
          <div className="flex w-full flex-wrap justify-center gap-2">
            {files.map((f, i) => (
              <span key={f.url} className="wso-bubble relative h-24 w-24 overflow-hidden rounded-xl border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local */}
                <img src={f.url} alt={`Vista previa ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label={`Quitar imagen ${i + 1}`}
                  onClick={() => setFiles((all) => all.filter((x) => x.url !== f.url))}
                  className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white"
                >
                  <Icon name="x" size={13} />
                </button>
              </span>
            ))}
            {files.length < 12 && (
              <button type="button" onClick={() => fileRef.current?.click()} className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-white/15 text-mute hover:text-fg" aria-label="Agregar más imágenes">
                <Icon name="upload" size={20} />
              </button>
            )}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" aria-label="Imágenes para la bitácora" onChange={(e) => {
          addFiles(imageFiles(e.target.files));
          e.target.value = "";
        }} />
      </div>

      <div role="radiogroup" aria-label="Tipo de captura" className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={kind === k.id}
            title={k.hint}
            onClick={() => setKind(k.id)}
            className={`${btn.chip} ${kind === k.id ? "border-lime/50 bg-lime/15 text-lime" : ""}`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <label className="flex flex-col gap-1 text-xs text-mute">
          Fecha
          <input type="date" className={input} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-mute">
          Nota (opcional)
          <input className={input} value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="Ej. primer día con el tablero limpio" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btn.primary} disabled={!files.length || busy} onClick={() => void save()}>
          {busy ? "Guardando…" : files.length > 1 ? `Guardar ${files.length} capturas` : "Guardar en bitácora"}
        </button>
        {msg && (
          <p role="status" className={`text-sm ${msg.ok ? "text-lime" : "text-amber"}`}>
            {msg.text}
          </p>
        )}
      </div>
      <p className="text-xs text-mute">Las imágenes se guardan solo en este navegador y se reducen a 1600 px para no llenar tu teléfono.</p>
    </Card>
  );
}

// --- visor -------------------------------------------------------------------------
function Viewer({ list, index, onClose, onIndex }: { list: Capture[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const c = list[index]!;
  const url = useImageUrl(c.id, "full");
  const thumb = useImageUrl(c.id, "thumb");
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState(c.note);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < list.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, list.length, onClose, onIndex]);

  return (
    <div className="wso-fade fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-xl" role="dialog" aria-label={`${kindLabel(c.kind)} del ${fmtDay(c.date)}`}>
      <header className="flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{kindLabel(c.kind)}</p>
          <p className="tnum text-[13px] text-mute">
            {fmtDay(c.date)} · {index + 1} de {list.length}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar visor" className="ml-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-fg hover:bg-white/20">
          <Icon name="x" size={18} />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
        {(url ?? thumb) && (
          // eslint-disable-next-line @next/next/no-img-element -- imagen local (blob)
          <img key={c.id} src={url ?? thumb!} alt={c.note || kindLabel(c.kind)} className="wso-sheet max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
        )}
        {index > 0 && (
          <button type="button" aria-label="Anterior" onClick={() => onIndex(index - 1)} className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <Icon name="left" size={20} />
          </button>
        )}
        {index < list.length - 1 && (
          <button type="button" aria-label="Siguiente" onClick={() => onIndex(index + 1)} className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <Icon name="chevron" size={20} />
          </button>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void journal.update(c.id, { note: note.trim() });
          }}
        >
          <input aria-label="Nota de la captura" className={`${input} min-w-0`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="Agrega una nota" />
          <button type="submit" className={btn.ghost} disabled={note.trim() === c.note}>
            Guardar nota
          </button>
        </form>
        {confirm ? (
          <span className="flex items-center gap-2">
            <span className="text-sm">¿Borrar esta captura?</span>
            <button
              type="button"
              className={`${btn.ghost} text-danger`}
              onClick={() => {
                void journal.remove(c.id);
                setConfirm(false);
                if (list.length <= 1) onClose();
                else onIndex(Math.min(index, list.length - 2));
              }}
            >
              Sí, borrar
            </button>
            <button type="button" className={btn.ghost} onClick={() => setConfirm(false)}>
              Cancelar
            </button>
          </span>
        ) : (
          <button type="button" aria-label="Borrar captura" onClick={() => setConfirm(true)} className="flex h-11 w-11 items-center justify-center rounded-xl text-mute hover:bg-white/10 hover:text-danger">
            <Icon name="trash" size={18} />
          </button>
        )}
      </footer>
    </div>
  );
}

// --- antes y ahora -----------------------------------------------------------------
function BeforeAfter({ list }: { list: Capture[] }) {
  const kinds = KINDS.filter((k) => beforeAfter(list, k.id));
  const [kind, setKind] = useState<CaptureKind | null>(null);
  const [pos, setPos] = useState(50);
  const current = kind && kinds.some((k) => k.id === kind) ? kind : (kinds[0]?.id ?? null);
  const pair = current ? beforeAfter(list, current) : null;
  const before = useImageUrl(pair?.before.id ?? null, "full");
  const after = useImageUrl(pair?.after.id ?? null, "full");

  return (
    <Card id="antes-y-ahora" aria-labelledby="ba-h" className="flex scroll-mt-6 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H2 id="ba-h">Antes y ahora</H2>
        {pair && <span className="tnum text-[13px] text-mute">{pair.days === 0 ? "El mismo día" : `${pair.days} ${pair.days === 1 ? "día" : "días"} de diferencia`}</span>}
      </div>
      {!pair ? (
        <p className="rounded-2xl border border-dashed border-white/12 px-4 py-8 text-center text-sm text-mute">
          Con dos capturas del mismo tipo en días distintos aparece aquí la comparación. Sube la de hoy y mañana otra.
        </p>
      ) : (
        <>
          {kinds.length > 1 && (
            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
              {kinds.map((k) => (
                <button key={k.id} type="button" aria-pressed={current === k.id} onClick={() => setKind(k.id)} className={`${btn.chip} ${current === k.id ? "border-lime/50 bg-lime/15 text-lime" : ""}`}>
                  {k.label}
                </button>
              ))}
            </div>
          )}
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-black select-none" style={{ aspectRatio: `${pair.after.w} / ${pair.after.h}` }}>
            {after && (
              // eslint-disable-next-line @next/next/no-img-element -- imagen local
              <img src={after} alt={`Ahora, ${fmtShort(pair.after.date)}`} className="absolute inset-0 h-full w-full object-cover" />
            )}
            {before && (
              // eslint-disable-next-line @next/next/no-img-element -- imagen local
              <img src={before} alt={`Antes, ${fmtShort(pair.before.date)}`} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
            )}
            <span aria-hidden="true" className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_12px_rgb(255_255_255/0.8)]" style={{ left: `${pos}%` }}>
              <span className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg">
                <Icon name="compare" size={16} />
              </span>
            </span>
            <span className="tnum pointer-events-none absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-semibold backdrop-blur">Antes · {fmtShort(pair.before.date)}</span>
            <span className="tnum pointer-events-none absolute top-3 right-3 rounded-full bg-lime px-2.5 py-1 text-[12px] font-semibold text-ink">Ahora · {fmtShort(pair.after.date)}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={pos}
              onChange={(e) => setPos(Number(e.target.value))}
              aria-label="Mover el corte entre antes y ahora"
              className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
            />
          </div>
        </>
      )}
    </Card>
  );
}

// --- página ------------------------------------------------------------------------
export function JournalPage() {
  const hq = useHq();
  const today = useToday();
  const hour = useHour();
  const captures = useCaptures();
  if (!hq || !today || hour === null || !captures) return <Loading />;
  return <JournalView hq={hq} today={today} hour={hour} captures={captures} />;
}

function JournalView({ hq, today, hour, captures }: { hq: HqState; today: string; hour: number; captures: Capture[] }) {
  const params = useSearchParams();
  const asked = KindSchema.safeParse(params.get("nueva"));
  const [filter, setFilter] = useState<CaptureKind | "todas">("todas");
  const [open, setOpen] = useState<number | null>(null);
  const shown = filter === "todas" ? captures : captures.filter((c) => c.kind === filter);
  const weeks = groupByWeek(shown, hq.profile.startDate);
  const p = pulse(captures, today);
  const activeWeeks = groupByWeek(captures, hq.profile.startDate).length;
  const firstDate = captures.at(-1)?.date;
  const indexOf = (c: Capture) => shown.findIndex((x) => x.id === c.id);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Bitácora" sub="Tu avance, en imágenes" />

      <GhostTip text={pageTip("/bitacora", hq, today, p)} />

      <section aria-label="Resumen de la bitácora" className="grid grid-cols-3 gap-3">
        {[
          { label: "Capturas", value: String(p.total) },
          { label: "Días seguidos", value: String(p.streak) },
          { label: "Semanas con registro", value: String(activeWeeks) },
        ].map((s) => (
          <div key={s.label} className="glass rounded-[20px] p-4">
            <p className="text-xs text-mute">{s.label}</p>
            <p className="tnum font-display text-[28px] font-bold tracking-[-0.03em]">{s.value}</p>
          </div>
        ))}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <Composer today={today} hour={hour} initialKind={asked.success ? asked.data : hour < 12 ? "inicio" : "avance"} />
        <BeforeAfter list={captures} />
      </div>

      <section aria-labelledby="tl-h" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <H2 id="tl-h">Línea de tiempo</H2>
          {firstDate && <span className="tnum text-[13px] text-mute">Desde el {fmtShort(firstDate)}, {diffDays(firstDate, today) + 1} días documentados</span>}
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {(["todas", ...KINDS.map((k) => k.id)] as const).map((k) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`${btn.chip} ${filter === k ? "border-white/25 bg-white/[0.12]" : ""}`}>
              {k === "todas" ? "Todas" : kindLabel(k)}
              <span className="tnum ml-1.5 text-mute">{k === "todas" ? captures.length : captures.filter((c) => c.kind === k).length}</span>
            </button>
          ))}
        </div>

        {weeks.length === 0 ? (
          <div className="glass flex flex-col items-center gap-3 rounded-[22px] px-6 py-12 text-center">
            <GhostGlyph size={40} />
            <p className="max-w-sm text-[15px] text-fg/85">
              {captures.length === 0 ? "Tu línea de tiempo empieza con la primera captura. Sube la pantalla con la que arrancaste hoy." : "No hay capturas de este tipo todavía."}
            </p>
          </div>
        ) : (
          <ol className="relative flex flex-col gap-8 pl-6 md:pl-8">
            <span aria-hidden="true" className="absolute top-2 bottom-2 left-[7px] w-px bg-gradient-to-b from-lime/70 via-iris/50 to-transparent md:left-[11px]" />
            {weeks.map((w) => (
              <li key={w.key} className="relative">
                <span aria-hidden="true" className="absolute top-1.5 -left-6 h-[15px] w-[15px] rounded-full border-2 border-lime bg-bg shadow-[0_0_12px_rgb(198_244_50/0.6)] md:-left-8 md:h-[23px] md:w-[23px] md:top-0.5" />
                <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="font-display text-[18px] font-semibold tracking-[-0.015em]">{w.title}</h3>
                  {w.range && <span className="text-[13px] text-mute">{w.range}</span>}
                  <span className="tnum text-[13px] text-mute">
                    {w.count} {w.count === 1 ? "captura" : "capturas"}
                  </span>
                </div>
                <div className="flex flex-col gap-4">
                  {w.days.map((d) => (
                    <div key={d.date}>
                      <p className="mb-2 text-[13px] font-medium text-fg/80">{d.date === today ? "Hoy" : fmtDay(d.date)}</p>
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                        {d.items.map((c) => (
                          <Thumb key={c.id} c={c} onOpen={() => setOpen(indexOf(c))} className="aspect-[4/3]" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {open !== null && shown[open] && <Viewer list={shown} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />}
    </div>
  );
}

// --- piezas para otras pantallas ---------------------------------------------------

/** Sombra dejando un consejo en un punto clave de la pantalla. */
export function GhostTip({ text, name = "Sombra" }: { text: string; name?: string }) {
  return (
    <div className="glass flex items-start gap-3 rounded-2xl px-4 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-iris/35 to-iris/10 ring-1 ring-inset ring-iris/30">
        <GhostGlyph size={20} />
      </span>
      <p className="text-[14px] leading-snug text-fg/90">
        <span className="font-semibold text-iris">{name}. </span>
        {text}
      </p>
    </div>
  );
}

/** Tarjeta de "Captura del día" en Hoy: sube en un toque o ve las de hoy. */
export function TodayCapture({ today }: { today: string }) {
  const captures = useCaptures();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const todays = (captures ?? []).filter((c) => c.date === today);
  const latest = (captures ?? []).filter((c) => c.date !== today).slice(0, 3);

  async function upload(list: File[]) {
    if (!list.length) return;
    setBusy(true);
    setErr(null);
    try {
      for (const f of list) await journal.add(f, { date: today, kind: "inicio", note: "" });
    } catch {
      setErr("No se pudo leer esa imagen. Prueba con otra.");
    }
    setBusy(false);
  }

  return (
    <Card aria-labelledby="cap-h" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <H2 id="cap-h">Captura del día</H2>
        <Link href="/bitacora" className="text-[13px] font-semibold text-iris hover:underline">
          Ver bitácora
        </Link>
      </div>
      {todays.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {todays.slice(0, 3).map((c) => (
              <Link key={c.id} href="/bitacora" className="block">
                <Thumb c={c} className="aspect-square" />
              </Link>
            ))}
          </div>
          <p className="text-[13px] text-lime">Hoy ya quedó documentado. Mañana, otra.</p>
        </>
      ) : (
        <>
          <p className="text-[15px] leading-snug text-fg/85">Sube la pantalla con la que arrancas el día. En unas semanas vas a ver todo lo que avanzaste.</p>
          {latest.length > 0 && (
            <div className="grid grid-cols-3 gap-2 opacity-70">
              {latest.map((c) => (
                <Thumb key={c.id} c={c} className="aspect-square" />
              ))}
            </div>
          )}
          <button type="button" className={`${btn.primary} self-start`} disabled={busy || captures === null} onClick={() => ref.current?.click()}>
            <Icon name="upload" size={17} />
            {busy ? "Guardando…" : "Subir captura de hoy"}
          </button>
        </>
      )}
      {err && <p role="status" className="text-sm text-amber">{err}</p>}
      <input ref={ref} type="file" accept="image/*" multiple className="sr-only" aria-label="Captura de hoy" onChange={(e) => {
        void upload(imageFiles(e.target.files));
        e.target.value = "";
      }} />
    </Card>
  );
}
