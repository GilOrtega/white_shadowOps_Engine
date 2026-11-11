"use client";

import { useState } from "react";
import * as L from "@/hq/logic";
import type { HqState } from "@/hq/schemas";
import { actions, parseNumber, useHq } from "@/hq/store";
import { useToday } from "@/hq/useToday";
import { btn, Card, H2, input, Loading, PageTitle } from "./ui";
import { GhostTip } from "./Journal";
import { pageTip } from "@/hq/coordinator";
import { WeightChart } from "./WeightChart";

export function Progress() {
  const hq = useHq();
  const today = useToday();
  if (!hq || !today) return <Loading />;
  return <ProgressView hq={hq} today={today} />;
}

const fmtDay = (d: string) => new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short" }).format(L.parseDate(d));

export function ProgressView({ hq, today }: { hq: HqState; today: string }) {
  const series = L.weightSeries(hq);
  const rate = L.weeklyRate(series);
  const trend = series.at(-1)?.trend ?? hq.profile.startWeightKg;
  const change = trend - hq.profile.startWeightKg;
  const prog = L.progress(hq);
  const days = L.lastDays(hq, today, 14).reverse();
  const stats = [
    { label: "Inicio", value: `${hq.profile.startWeightKg} kg` },
    { label: "Tendencia actual", value: L.fmtKg(trend) },
    { label: "Cambio total", value: `${change > 0 ? "+" : ""}${change.toFixed(1)} kg` },
    { label: "Ritmo", value: rate === null ? "Faltan datos" : `${rate > 0 ? "+" : ""}${rate.toFixed(1)} kg/sem` },
    { label: "Días cumplidos", value: String(prog.completeDays) },
    { label: "Racha", value: `${L.streak(hq, today)} días` },
    { label: "Nivel", value: `${prog.level} · ${prog.xp} XP` },
    { label: "Meta", value: hq.profile.goalWeightKg === null ? "Sin definir" : L.fmtKg(hq.profile.goalWeightKg) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Progreso" sub="Lo que cuenta es la tendencia" />
      <GhostTip name={hq.profile.mascotName} text={pageTip("/progreso", hq, today, null)} />

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-[22px] p-4">
            <dt className="text-xs text-mute">{s.label}</dt>
            <dd className="tnum font-display text-[22px] font-bold tracking-[-0.03em]">{s.value}</dd>
          </div>
        ))}
      </dl>

      <Card id="pesaje" aria-labelledby="peso-h" className="flex scroll-mt-6 flex-col gap-4">
        <H2 id="peso-h">Peso</H2>
        <WeightChart series={series} goalKg={hq.profile.goalWeightKg} />
        <WeightForm today={today} />
        <p className="text-xs text-mute">Pésate siempre igual: en la mañana, después de ir al baño y antes de desayunar.</p>
      </Card>

      <Card aria-labelledby="hist-h" className="flex flex-col gap-3">
        <H2 id="hist-h">Últimos 14 días</H2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead className="text-xs text-mute">
              <tr><th className="py-2 pr-3 font-medium">Fecha</th><th className="py-2 pr-3 font-medium">Entreno</th><th className="py-2 pr-3 font-medium">Comidas</th><th className="py-2 pr-3 font-medium">Calorías</th><th className="py-2 pr-3 font-medium">Peso</th><th className="py-2 font-medium">Día</th></tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <th scope="row" className="py-2 pr-3 font-medium">{fmtDay(d.date)}</th>
                  <td className="py-2 pr-3">{d.trained ? "Sí" : "—"}</td>
                  <td className="py-2 pr-3">{d.meals || "—"}</td>
                  <td className={`py-2 pr-3 ${d.kcal > hq.profile.calorieTarget ? "text-amber" : ""}`}>{d.kcal ? d.kcal.toLocaleString("es-MX") : "—"}</td>
                  <td className="py-2 pr-3">{d.weightKg !== null ? d.weightKg.toFixed(1) : "—"}</td>
                  <td className={`py-2 font-semibold ${d.complete ? "text-accent" : "text-mute"}`}>{d.complete ? "Cumplido" : "Pendiente"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function WeightForm({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [kg, setKg] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
      e.preventDefault();
      const n = parseNumber(kg);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return setMsg("Elige una fecha de hoy o anterior.");
      if (n === null || n < 30 || n > 300) return setMsg("El peso debe estar entre 30 y 300 kg.");
      actions.setWeight(date, Math.round(n * 100) / 100);
      setKg("");
      setMsg(`Guardado: ${n.toFixed(1)} kg.`);
    }}>
      <label className="flex flex-col gap-1 text-xs text-mute">Fecha
        <input type="date" className={`${input} max-w-44`} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-mute">Peso en ayunas (kg)
        <input className={`${input} max-w-32`} inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="87.4" />
      </label>
      <button type="submit" className={btn.primary}>Registrar pesaje</button>
      {msg && <span role="status" className="text-sm text-mute">{msg}</span>}
    </form>
  );
}
