"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "./ui";

const NAV = [
  { href: "/", label: "Hoy", icon: "home" },
  { href: "/plan", label: "Plan", icon: "target" },
  { href: "/progreso", label: "Progreso", icon: "chart" },
  { href: "/engine", label: "Shorts", icon: "video" },
  { href: "/ajustes", label: "Ajustes", icon: "gear" },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <div className="min-h-dvh md:flex">
      <nav aria-label="Principal" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 p-5 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime text-ink"><Icon name="shield" size={18} /></span>
          <span className="font-display text-xl font-bold tracking-tight">WhiteShadow</span>
        </div>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] ${active(n.href) ? "bg-panel font-semibold text-fg" : "text-mute hover:text-fg"}`}>
            <Icon name={n.icon} size={20} />{n.label}
          </Link>
        ))}
      </nav>
      <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] md:px-8 md:pb-12 md:pt-10">
        <div key={path} className="wso-in">{children}</div>
      </main>
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-10 border-t border-line/70 bg-panel/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
              className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 pt-1.5 text-[10px] font-medium ${active(n.href) ? "text-accent" : "text-mute"}`}>
              <Icon name={n.icon} size={24} strokeWidth={active(n.href) ? 2.4 : 1.8} />{n.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
