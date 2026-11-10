import { Suspense } from "react";
import { connection } from "next/server";
import { mineClips } from "@/engine";
import { demoLlm, demoTranscript } from "@/engine/demo/fake";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function EnginePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-neutral-950 p-5 font-mono text-neutral-400">Minando clips…</main>}>
      <MinerResults />
    </Suspense>
  );
}

async function MinerResults() {
  await connection(); // render dinámico en cada request
  const res = await mineClips(demoLlm, demoTranscript(), { context: "demo" });

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-5 font-mono">
      <h1 className="text-xl font-bold">whiteShadowOps_Engine</h1>
      <p className="text-sm text-neutral-400 mb-5">Fase 1 · Content Miner · modo demo (LLM falso)</p>

      <div className="grid grid-cols-3 gap-2 mb-6 text-center">
        <Stat label="ventanas" value={res.stats.windows} />
        <Stat label="clips" value={res.clips.length} />
        <Stat label="descartados" value={res.dropped.length} />
      </div>

      <ul className="space-y-3">
        {res.clips.map((c) => (
          <li key={c.id} className="rounded-lg border border-neutral-800 p-3">
            <div className="flex justify-between text-xs text-neutral-400">
              <span>{fmt(c.startTime)} → {fmt(c.endTime)} · {c.duration}s</span>
              <span className="text-emerald-400">score {c.scores.final}</span>
            </div>
            <p className="mt-1 font-semibold">{c.hookText}</p>
            <p className="text-xs text-neutral-400">{c.topic} · {c.category}</p>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 mb-2 text-sm text-neutral-400">Descartados</h2>
      <ul className="text-xs text-neutral-500 space-y-1">
        {res.dropped.map((d, i) => (
          <li key={i}>{d.reason} — {d.candidate.topic}</li>
        ))}
      </ul>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-neutral-900 p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-neutral-400">{label}</div>
    </div>
  );
}
