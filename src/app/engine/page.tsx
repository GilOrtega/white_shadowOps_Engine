import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Shell } from "@/components/hq/Shell";
import { mineClips } from "@/engine";
import { demoLlm, demoTranscript } from "@/engine/demo/fake";

export const metadata: Metadata = { title: "Shorts — WhiteShadow" };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const STAGES = [
  { name: "Miner", what: "Elige los mejores momentos de 30 a 60 s", state: "Listo" },
  { name: "Editor", what: "Recorta a vertical y pone subtítulos", state: "Listo" },
  { name: "Transcripción", what: "Convierte tu voz en texto con tiempos", state: "Listo" },
  { name: "Subida desde la app", what: "Subir el video aquí y que salga solo", state: "Falta" },
  { name: "Publisher", what: "Título, hashtags y publicar en TikTok, Reels y Shorts", state: "Falta" },
];

export default function EnginePage() {
  return (
    <Shell>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-[34px] font-bold leading-tight tracking-tight">Shorts</h1>
          <p className="max-w-2xl text-sm text-mute">El motor que convierte un video largo en shorts ya funciona, pero por ahora corre en tu compu, no desde esta pantalla.</p>
        </header>

        <section aria-labelledby="st-h" className="flex flex-col gap-3 rounded-3xl bg-panel p-5">
          <h2 id="st-h" className="text-[20px] font-semibold tracking-tight">Qué está hecho</h2>
          <ul className="flex flex-col gap-2">
            {STAGES.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-3 rounded-2xl bg-well px-3 py-2.5">
                <span className="min-w-0"><span className="block text-sm font-semibold">{s.name}</span><span className="text-xs text-mute">{s.what}</span></span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${s.state === "Listo" ? "bg-sky/15 text-sky" : "bg-edge text-mute"}`}>{s.state}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-fg/85">Para usarlo hoy, en la terminal de tu proyecto:</p>
          <pre className="overflow-x-auto rounded-2xl bg-well p-3 text-xs text-fg/85"><code>npm run pipeline -- &quot;C:\videos\stream.mp4&quot; --layout split --max 5</code></pre>
        </section>

        <Suspense fallback={<p className="text-sm text-mute">Corriendo la demostración…</p>}>
          <MinerDemo />
        </Suspense>
      </div>
    </Shell>
  );
}

async function MinerDemo() {
  await connection(); // se calcula en cada visita
  const res = await mineClips(demoLlm, demoTranscript(), { context: "demo" });
  return (
    <section aria-labelledby="demo-h" className="flex flex-col gap-3 rounded-3xl bg-panel p-5">
      <h2 id="demo-h" className="text-[20px] font-semibold tracking-tight">Demostración con datos de prueba</h2>
      <p className="text-sm text-mute">No es un video tuyo: es una transcripción inventada de 40 minutos para enseñar cómo elige y descarta el Miner. Encontró {res.clips.length} clips y descartó {res.dropped.length}.</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {res.clips.map((c) => (
          <li key={c.id} className="rounded-2xl bg-well p-3">
            <div className="flex justify-between text-xs text-mute"><span>{fmt(c.startTime)} a {fmt(c.endTime)} · {c.duration} s</span><span>puntaje {c.scores.final}</span></div>
            <p className="mt-1 text-sm font-semibold">{c.hookText}</p>
            <p className="text-xs text-mute">{c.topic}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
