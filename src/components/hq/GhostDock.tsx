"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { briefing, pageTip, type AlertTone, type CoordAlert } from "@/hq/coordinator";
import { pulse } from "@/hq/journal";
import { useCaptures } from "@/hq/journal-store";
import type { HqState } from "@/hq/schemas";
import { useHq } from "@/hq/store";
import { useHour, useToday } from "@/hq/useToday";
import { MascotFace } from "./Mascot";
import { Icon } from "./ui";

/** Marca mínima de Sombra para lugares chicos (logo, tips). */
export function GhostGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5c4.6 0 7.5 3.3 7.5 7.6v10.4l-2.5-1.7-2.5 1.7-2.5-1.7-2.5 1.7-2.5-1.7-2.5 1.7V10.1C4.5 5.8 7.4 2.5 12 2.5z" fill="#f4f6fb" />
      <path d="M5.2 8.3q6.8-2.4 13.6 0v-2q-6.8-2.4-13.6 0z" fill="#c6f432" />
      <ellipse cx="9.4" cy="11.6" rx="1.35" ry="1.75" fill="#111" />
      <ellipse cx="14.6" cy="11.6" rx="1.35" ry="1.75" fill="#111" />
    </svg>
  );
}

const TONE: Record<AlertTone, string> = {
  ai: "bg-iris shadow-[0_0_10px_var(--iris)]",
  warn: "bg-amber shadow-[0_0_10px_var(--amber)]",
  good: "bg-accent shadow-[0_0_10px_var(--accent)]",
};

const seenKey = (path: string, today: string) => `wso.tip.${today}.${path}`;
function wasSeen(path: string, today: string) {
  try {
    return window.sessionStorage.getItem(seenKey(path, today)) === "1";
  } catch {
    return false;
  }
}

/** Sombra flotando en todas las pantallas: resumen, alertas y el siguiente paso. */
export function GhostDock() {
  const hq = useHq();
  const today = useToday();
  const hour = useHour();
  const captures = useCaptures();
  if (!hq || !today || hour === null) return null;
  return <Dock hq={hq} today={today} hour={hour} journal={captures ? pulse(captures, today) : null} />;
}

function Dock({ hq, today, hour, journal }: { hq: HqState; today: string; hour: number; journal: ReturnType<typeof pulse> | null }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const b = briefing(hq, today, hour, journal);
  const tip = pageTip(path, hq, today, journal);
  const pending = b.alerts.filter((a) => a.tone !== "good").length;
  const showBubble = !open && !dismissed.has(path) && !wasSeen(path, today);

  // El tip de cada pantalla aparece una vez por sesión y se va solo.
  useEffect(() => {
    if (!showBubble) return;
    try {
      window.sessionStorage.setItem(seenKey(path, today), "1");
    } catch {
      /* sin sessionStorage: se ve cada vez */
    }
    const id = window.setTimeout(() => setDismissed((d) => new Set(d).add(path)), 9000);
    return () => window.clearTimeout(id);
  }, [showBubble, path, today]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div
      ref={panelRef}
      className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+6rem)] z-40 flex flex-col items-end gap-3 md:right-6 md:bottom-6"
    >
      {open && (
        <section
          role="dialog"
          aria-label={`${hq.profile.mascotName}, tu coordinador`}
          className="wso-sheet glass glass-strong shattered w-[min(23rem,calc(100vw-2rem))] origin-bottom-right overflow-hidden rounded-[24px] p-4"
        >
          <header className="flex items-center gap-3">
            <span className="relative flex h-12 w-12 shrink-0 items-end justify-center rounded-2xl bg-gradient-to-b from-iris/35 to-iris/5 ring-1 ring-inset ring-iris/30">
              <MascotFace mood={b.mood} size={40} />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold">{hq.profile.mascotName}</p>
              <p className="text-xs text-mute">Coordina a tus agentes</p>
            </div>
            <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-mute hover:bg-white/10 hover:text-fg">
              <Icon name="x" size={16} />
            </button>
          </header>

          <p className="mt-4 font-display text-[19px] font-semibold leading-snug tracking-[-0.01em]">{b.headline}</p>
          <p className="mt-1 text-[13px] text-mute">{b.summary}</p>

          {b.next && (
            <Link
              href={b.next.href}
              onClick={() => setOpen(false)}
              className="group mt-4 flex items-center gap-3 rounded-2xl bg-lime px-4 py-3 text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_10px_30px_-10px_rgb(198_244_50/0.6)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold opacity-70">Siguiente paso</span>
                <span className="block text-[15px] font-semibold leading-snug">{b.next.text}</span>
              </span>
              <span className="transition-transform group-hover:translate-x-0.5">
                <Icon name="arrow" size={18} />
              </span>
            </Link>
          )}

          {b.alerts.filter((a) => a.id !== b.next?.id).length > 0 && (
            <ul className="mt-3 flex flex-col gap-1">
              {b.alerts
                .filter((a) => a.id !== b.next?.id)
                .map((a) => (
                  <AlertRow key={a.id} a={a} onGo={() => setOpen(false)} />
                ))}
            </ul>
          )}

          <Link
            href="/progreso#sombra"
            onClick={() => setOpen(false)}
            className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-2.5 text-[14px] font-medium text-mute hover:bg-white/[0.08] hover:text-fg"
          >
            <Icon name="sparkle" size={15} />
            Platicar con {hq.profile.mascotName}
          </Link>
        </section>
      )}

      {showBubble && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="wso-bubble glass glass-strong max-w-[17rem] rounded-2xl rounded-br-md px-4 py-3 text-left text-[14px] leading-snug"
        >
          <span className="mb-0.5 block text-[12px] font-semibold text-iris">{hq.profile.mascotName}</span>
          {tip}
        </button>
      )}

      <button
        type="button"
        aria-expanded={open}
        aria-label={`${open ? "Cerrar" : "Abrir"} a ${hq.profile.mascotName}${pending ? `, ${pending} pendientes` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className="group relative flex h-13 w-13 items-end justify-center rounded-[18px] hover:-translate-y-0.5 md:h-16 md:w-16 md:rounded-[22px]"
      >
        <span aria-hidden="true" className="wso-aura absolute inset-1 rounded-[inherit] bg-iris/45 blur-xl" />
        <span aria-hidden="true" className="glass glass-strong absolute inset-0 rounded-[inherit]" />
        <span className="relative pb-0.5 [&>svg]:h-auto [&>svg]:w-[40px] md:[&>svg]:w-[50px]">
          <MascotFace mood={b.mood} size={50} />
        </span>
        {pending > 0 && (
          <span className="tnum absolute -top-1.5 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-lime px-1.5 text-[12px] font-bold text-ink ring-2 ring-bg">
            {pending}
          </span>
        )}
      </button>
    </div>
  );
}

function AlertRow({ a, onGo }: { a: CoordAlert; onGo: () => void }) {
  return (
    <li>
      <Link href={a.href} onClick={onGo} className="group flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-white/[0.05]">
        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[a.tone]}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold text-mute">{a.agent}</span>
          <span className="block text-[14px] leading-snug">{a.text}</span>
        </span>
        <span className="mt-0.5 shrink-0 text-[12px] font-semibold text-iris opacity-80 group-hover:opacity-100">{a.cta}</span>
      </Link>
    </li>
  );
}
