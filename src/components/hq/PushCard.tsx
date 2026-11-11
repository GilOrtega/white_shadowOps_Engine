"use client";

import { useState, useSyncExternalStore } from "react";
import { disablePush, enablePush, pushSupport, testPush, type PushSupport } from "@/hq/push-client";
import type { HqState } from "@/hq/schemas";
import { useUiPrefs } from "@/hq/ui-prefs";
import { useToday } from "@/hq/useToday";
import { btn, Card, H2 } from "./ui";

const noop = () => () => {};

/** Ajustes → avisos push de "Rapo a la 0". */
export function PushCard({ hq }: { hq: HqState }) {
  const { push } = useUiPrefs();
  const today = useToday();
  const support = useSyncExternalStore<PushSupport | null>(noop, pushSupport, () => null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(f: () => Promise<{ ok: true } | { ok: false; message: string }>, okText: string) {
    setBusy(true);
    setMsg(null);
    const r = await f();
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.message });
  }

  return (
    <Card aria-labelledby="push-h" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <H2 id="push-h">💈 Avisos del reto</H2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${push ? "bg-accent/15 text-accent" : "bg-white/[0.06] text-mute"}`}>{push ? "Activos" : "Apagados"}</span>
      </div>
      <p className="text-sm text-fg/85">
        Si a las <b>2 pm</b> no has registrado comidas, a las <b>8 pm</b> te falta algo o a las <b>9 pm</b> no has entrenado, te llega un aviso aunque la app esté cerrada. Si ya cumpliste, no te molesta.
      </p>
      <p className="text-xs text-mute">Al servidor solo va un resumen del día (qué misiones faltan), nunca tus comidas ni tu peso.</p>
      {support === "ios-instalar" && (
        <p className="rounded-xl bg-amber/10 px-3 py-2 text-sm text-amber">En iPhone: toca Compartir → <b>Agregar a inicio</b>, abre WhiteShadow desde ese ícono y actívalos ahí.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {!push ? (
          <button type="button" className={btn.primary} disabled={busy || !today || support === "no-soporta"} onClick={() => today && void run(() => enablePush(hq, today), "Listo. Te aviso si el día va en peligro.")}>
            {busy ? "Activando…" : "Activar avisos"}
          </button>
        ) : (
          <>
            <button type="button" className={btn.ghost} disabled={busy} onClick={() => void run(() => testPush(hq), "Aviso de prueba enviado.")}>Mandar prueba</button>
            <button type="button" className={btn.chip} disabled={busy} onClick={() => void run(() => disablePush(hq), "Avisos apagados en este dispositivo.")}>Apagar</button>
          </>
        )}
      </div>
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-accent" : "text-amber"}`}>{msg.text}</p>}
      <details className="text-xs text-mute">
        <summary className="cursor-pointer">Configuración del servidor (una sola vez)</summary>
        <ol className="mt-2 flex list-inside list-decimal flex-col gap-1">
          <li>Corre <code className="text-accent">npm run push:keys</code> y pega las variables en Vercel.</li>
          <li>Vercel → Storage → <b>Upstash Redis</b> (gratis) y conéctalo al proyecto.</li>
          <li>Vuelve a desplegar. Los avisos salen ~2, ~8 y ~9 pm (el plan Hobby puede moverlos dentro de esa hora).</li>
        </ol>
      </details>
    </Card>
  );
}
