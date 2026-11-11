"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { challengeInfo } from "@/hq/logic";
import { useHq } from "@/hq/store";
import { useToday } from "@/hq/useToday";
import { CommandPalette, openCommandPalette } from "./CommandPalette";
import { GhostDock, GhostGlyph } from "./GhostDock";
import { Icon } from "./ui";

const NAV = [
  { href: "/", label: "Hoy", icon: "home" },
  { href: "/plan", label: "Plan", icon: "target" },
  { href: "/progreso", label: "Progreso", icon: "chart" },
  { href: "/bitacora", label: "Bitácora", icon: "image" },
  { href: "/crew", label: "Shorts", icon: "sparkles" },
  { href: "/engine", label: "Motor", icon: "video" },
  { href: "/ajustes", label: "Ajustes", icon: "gear" },
] as const;
/** En el celular no cabe todo: el Motor se abre desde el Estudio. */
const TABS = NAV.filter((n) => n.href !== "/engine");

/** El brillo del vidrio sigue al cursor: una sola escucha para toda la app. */
function usePointerGlow() {
  useEffect(() => {
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = (e.target as Element | null)?.closest?.(".glass") as HTMLElement | null;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);
}

function ProfileChip() {
  const hq = useHq();
  const today = useToday();
  if (!hq || !today) return <div className="h-14" />;
  const info = challengeInfo(hq.profile, today);
  return (
    <Link href="/ajustes" className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/[0.05]">
      {hq.profile.photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto local en data URL
        <img src={hq.profile.photo} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover ring-1 ring-white/15" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] font-display text-sm font-bold ring-1 ring-white/10">{hq.profile.name.charAt(0)}</span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold">{hq.profile.name}</span>
        <span className="tnum block text-[12px] text-mute">
          Día {info.dayNumber} de {hq.profile.challengeDays}
        </span>
      </span>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  usePointerGlow();

  return (
    <div className="min-h-dvh">
      <div className="wso-ambient" aria-hidden="true" />

      <nav aria-label="Principal" className="glass fixed top-3 bottom-3 left-3 z-30 hidden w-[232px] flex-col rounded-[22px] p-3 md:flex">
        <Link href="/" className="mb-5 flex items-center gap-2.5 px-2 pt-1.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-white/15 to-white/5 ring-1 ring-inset ring-white/15">
            <GhostGlyph size={22} />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-[16px] font-bold tracking-[-0.02em]">WhiteShadow</span>
            <span className="block text-[11px] text-mute">Centro de mando</span>
          </span>
        </Link>

        <button
          type="button"
          onClick={openCommandPalette}
          className="mb-4 flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/20 px-3 text-[13px] text-mute hover:border-white/15 hover:text-fg"
        >
          <Icon name="search" size={15} />
          Buscar o ir a
          <kbd className="ml-auto rounded-md border border-white/10 px-1.5 text-[11px]">⌘K</kbd>
        </button>

        <div className="flex flex-col gap-0.5">
          {NAV.map((n) => {
            const on = active(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] ${
                  on ? "bg-white/[0.08] font-semibold text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]" : "text-mute hover:bg-white/[0.04] hover:text-fg"
                }`}
              >
                {on && <span aria-hidden="true" className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-full bg-lime shadow-[0_0_10px_var(--accent)]" />}
                <span className={on ? "text-lime" : ""}>
                  <Icon name={n.icon} size={18} strokeWidth={on ? 2.2 : 1.8} />
                </span>
                {n.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto border-t border-white/[0.06] pt-2">
          <ProfileChip />
        </div>
      </nav>

      <div className="md:pl-[244px]">
        <main className="mx-auto w-full min-w-0 max-w-[1080px] px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(8rem+env(safe-area-inset-bottom))] md:px-10 md:pt-9 md:pb-16">
          <div key={path} className="wso-in">
            {children}
          </div>
        </main>
      </div>

      <nav
        aria-label="Principal"
        className="glass glass-strong fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 rounded-[22px] md:hidden"
      >
        <div className="grid grid-cols-6 px-1">
          {TABS.map((n) => {
            const on = active(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`flex h-[3.6rem] flex-col items-center justify-center gap-1 text-[10px] font-medium ${on ? "text-lime" : "text-mute"}`}
              >
                <Icon name={n.icon} size={22} strokeWidth={on ? 2.3 : 1.8} />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <GhostDock />
      <CommandPalette />
    </div>
  );
}
