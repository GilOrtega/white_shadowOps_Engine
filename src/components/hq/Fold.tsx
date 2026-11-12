"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { getUiPrefs, setUiPrefs, useUiPrefs } from "@/hq/ui-prefs";

/**
 * Sección desplegable del tablero. Recuerda si la dejaste abierta o cerrada (en este navegador).
 * Cerrada solo muestra el título y un resumen de una línea, para que la pantalla respire.
 * El contenido se oculta con `hidden` (no se desmonta) para no perder lo que estabas escribiendo.
 */
export function Fold({ id, title, summary, tone = "text-fg", defaultOpen = false, children }: {
  id: string;
  title: string;
  summary?: ReactNode;
  tone?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const prefs = useUiPrefs();
  const open = prefs.open?.[id] ?? defaultOpen;
  const toggle = () => setUiPrefs({ open: { ...prefs.open, [id]: !open } });
  const bodyId = `fold-${id}`;
  const ref = useRef<HTMLElement>(null);

  // Un enlace a algo que vive dentro (p. ej. "#comidas") abre la sección antes de saltar.
  useEffect(() => {
    const openFor = (hash: string) => {
      const target = hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
      if (target && ref.current?.contains(target)) {
        setUiPrefs({ open: { ...getUiPrefs().open, [id]: true } });
        requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href*='#']");
      if (a) openFor(new URL((a as HTMLAnchorElement).href).hash);
    };
    openFor(window.location.hash);
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [id]);

  return (
    <section ref={ref} id={id} aria-labelledby={`${bodyId}-h`} className="scroll-mt-6">
      <h2 id={`${bodyId}-h`} className="m-0">
        <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={toggle}
          className="glass flex min-h-14 w-full items-center gap-3 rounded-[20px] px-4 py-3 text-left transition-colors hover:bg-white/[0.06]">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={`font-display text-[18px] font-bold tracking-[-0.02em] ${tone}`}>{title}</span>
            {summary && <span className="truncate text-[13px] font-normal text-mute">{summary}</span>}
          </span>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            className={`shrink-0 text-mute transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h2>
      <div id={bodyId} hidden={!open} className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** Índice de secciones: un toque abre la sección y te lleva a ella. */
export function FoldIndex({ items }: { items: { id: string; label: string; dot: string }[] }) {
  const prefs = useUiPrefs();
  return (
    <nav aria-label="Secciones del tablero" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {items.map((it) => (
        <button key={it.id} type="button" className="flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-white/[0.06] px-3.5 text-[13px] font-medium hover:bg-white/[0.1]"
          onClick={() => {
            setUiPrefs({ open: { ...prefs.open, [it.id]: true } });
            requestAnimationFrame(() => document.getElementById(it.id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
          }}>
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${it.dot}`} />
          {it.label}
        </button>
      ))}
      <button type="button" className="flex min-h-10 shrink-0 items-center rounded-full px-3 text-[13px] text-mute hover:text-fg"
        onClick={() => setUiPrefs({ open: Object.fromEntries(items.map((i) => [i.id, false])) })}>
        Cerrar todo
      </button>
    </nav>
  );
}
