"use client";

import type { HqState } from "@/hq/schemas";
import { pullNow, useSyncStatus } from "@/hq/sync-client";
import { btn, Card, H2 } from "./ui";

/** Ajustes → estado de la sincronización con la nube. */
export function SyncCard({ hq }: { hq: HqState }) {
  const st = useSyncStatus();
  const tone = st.kind === "ok" ? "bg-accent/15 text-accent" : st.kind === "error" ? "bg-amber/15 text-amber" : st.kind === "syncing" ? "bg-sky/15 text-sky" : "bg-white/[0.06] text-mute";
  return (
    <Card aria-labelledby="sync-h" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <H2 id="sync-h">☁️ Sincronización</H2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{st.kind === "ok" ? "Al día" : st.kind === "syncing" ? "Sincronizando…" : st.kind === "error" ? "Pendiente" : "Apagada"}</span>
      </div>
      <p className="text-sm text-fg/85">Tus datos viajan entre tu celular, tu compu y cualquier link de la app, y los agentes los pueden leer cuando trabajan solos. Las fotos de la Bitácora se quedan en cada dispositivo.</p>
      <p className="text-xs text-mute">{hq.accessKey ? `${st.message}${st.at ? ` · ${new Date(st.at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}` : ""}` : "Pon tu clave de acceso (Agentes con IA) para activarla. Requiere Upstash Redis en Vercel."}</p>
      {hq.accessKey && <button type="button" className={`${btn.chip} self-start`} onClick={() => void pullNow(hq.accessKey)}>Sincronizar ahora</button>}
    </Card>
  );
}
