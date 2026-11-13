"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./ui";

interface Cmd {
  id: string;
  label: string;
  group: "Ir a" | "Acciones";
  icon: string;
  href: string;
  keywords?: string;
}

const CMDS: Cmd[] = [
  { id: "hoy", label: "Hoy", group: "Ir a", icon: "home", href: "/", keywords: "inicio dashboard" },
  { id: "plan", label: "Plan de ataque", group: "Ir a", icon: "target", href: "/plan", keywords: "estratega semana" },
  { id: "progreso", label: "Progreso", group: "Ir a", icon: "chart", href: "/progreso", keywords: "peso tendencia" },
  { id: "bitacora", label: "Bitácora", group: "Ir a", icon: "image", href: "/bitacora", keywords: "capturas fotos linea tiempo" },
  { id: "nutri", label: "Nutriólogo", group: "Ir a", icon: "leaf", href: "/nutri", keywords: "comida dieta menu calorias proteina macros super nutriologo" },
  { id: "contenido", label: "Semana de contenido", group: "Ir a", icon: "calendar", href: "/contenido", keywords: "guion carrusel historia calendario marca ideas" },
  { id: "shorts", label: "Shorts", group: "Ir a", icon: "video", href: "/engine", keywords: "motor clips tiktok" },
  { id: "ajustes", label: "Ajustes", group: "Ir a", icon: "gear", href: "/ajustes", keywords: "perfil clave respaldo" },
  { id: "captura", label: "Subir captura del día", group: "Acciones", icon: "upload", href: "/bitacora?nueva=inicio", keywords: "foto imagen screenshot" },
  { id: "comida", label: "Registrar comida", group: "Acciones", icon: "fork", href: "/#comidas", keywords: "calorias nutri" },
  { id: "peso", label: "Registrar pesaje", group: "Acciones", icon: "scale", href: "/progreso#pesaje", keywords: "peso bascula kg" },
  { id: "antes", label: "Ver antes y ahora", group: "Acciones", icon: "compare", href: "/bitacora#antes-y-ahora", keywords: "comparar" },
  { id: "sombra", label: "Platicar con Sombra", group: "Acciones", icon: "sparkle", href: "/#sombra", keywords: "mascota chat ia" },
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const openCommandPalette = () => window.dispatchEvent(new Event("wso:cmdk"));

/** Buscador estilo Spotlight: ⌘K / Ctrl+K. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("wso:cmdk", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wso:cmdk", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const results = useMemo(() => {
    const t = norm(q.trim());
    return t ? CMDS.filter((c) => norm(`${c.label} ${c.keywords ?? ""}`).includes(t)) : CMDS;
  }, [q]);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    setQ("");
    setSel(0);
  };
  const go = (c: Cmd | undefined) => {
    if (!c) return;
    close();
    router.push(c.href);
  };

  let idx = -1;
  return (
    <div className="wso-fade fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[14vh] backdrop-blur-sm" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-label="Buscar o ir a" className="wso-sheet glass glass-strong w-full max-w-xl overflow-hidden rounded-[20px]">
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-4">
          <span className="text-mute">
            <Icon name="search" size={18} />
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") go(results[sel]);
              else if (e.key === "Escape") close();
            }}
            placeholder="Busca una pantalla o una acción"
            aria-label="Buscar"
            className="h-14 flex-1 bg-transparent text-[17px] text-fg placeholder:text-mute/60 focus:outline-none focus-visible:outline-none"
          />
          <kbd className="rounded-md border border-white/10 px-1.5 py-0.5 text-[11px] text-mute">esc</kbd>
        </div>
        <ul role="listbox" aria-label="Resultados" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-mute">Nada con “{q}”. Prueba con “peso” o “captura”.</li>}
          {(["Ir a", "Acciones"] as const).map((group) => {
            const items = results.filter((r) => r.group === group);
            if (!items.length) return null;
            return (
              <li key={group}>
                <p className="px-3 pt-2 pb-1 text-[12px] font-medium text-mute">{group}</p>
                <ul>
                  {items.map((c) => {
                    idx++;
                    const i = idx;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={sel === i}
                          onMouseEnter={() => setSel(i)}
                          onClick={() => go(c)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] ${sel === i ? "bg-white/[0.09] text-fg" : "text-fg/85"}`}
                        >
                          <span className={sel === i ? "text-iris" : "text-mute"}>
                            <Icon name={c.icon} size={18} />
                          </span>
                          {c.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
