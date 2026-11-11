"use client";

import { useRef, useState } from "react";
import type { MealEstimate } from "@/hq/agents/nutri";
import { callAgent, fileToJpegBase64 } from "@/hq/client";
import { dayOf, kcalOf, proteinOf } from "@/hq/logic";
import type { HqState } from "@/hq/schemas";
import { actions, parseNumber } from "@/hq/store";
import { Bar, btn, Card, group, H2, Icon, input } from "./ui";

type Draft = { name: string; kcal: string; protein: string; source: "manual" | "foto"; estimate: MealEstimate | null };
const EMPTY: Draft = { name: "", kcal: "", protein: "", source: "manual", estimate: null };

export function MealLogger({ hq, today }: { hq: HqState; today: string }) {
  const day = dayOf(hq, today);
  const kcal = kcalOf(day);
  const target = hq.profile.calorieTarget;
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const imageBase64 = await fileToJpegBase64(file);
      const res = await callAgent<MealEstimate>("/api/agents/nutri", { imageBase64, mediaType: "image/jpeg", hint: draft.name || undefined }, hq.accessKey);
      if (!res.ok) setMsg(`${res.message} Mientras, regístrala a mano.`);
      else if (!res.data.isFood) setMsg("El Nutri no ve comida en esa foto. Toma otra o regístrala a mano.");
      else setDraft({ name: res.data.name, kcal: String(res.data.kcal), protein: String(res.data.proteinG), source: "foto", estimate: res.data });
    } catch {
      setMsg("No se pudo leer esa imagen. Prueba con otra foto.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const k = parseNumber(draft.kcal);
    const p = draft.protein.trim() ? parseNumber(draft.protein) : null;
    if (!draft.name.trim() || k === null || k < 0 || k > 5000) return setMsg("Pon el nombre y las calorías (0 a 5000).");
    if (p !== null && (p < 0 || p > 400)) return setMsg("La proteína debe estar entre 0 y 400 g.");
    actions.addMeal(today, { name: draft.name.trim(), kcal: Math.round(k), proteinG: p, source: draft.source });
    setDraft(EMPTY);
    setMsg(null);
  }

  return (
    <Card aria-labelledby="nutri-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H2 id="nutri-h">Comidas de hoy</H2>
        <span className={`text-sm font-semibold ${kcal > target ? "text-amber" : "text-mute"}`}>
          {kcal.toLocaleString("es-MX")} de {target.toLocaleString("es-MX")} kcal · {Math.round(proteinOf(day))} g proteína
        </span>
      </div>
      <Bar pct={(kcal / target) * 100} tone={kcal > target ? "amber" : "accent"} label="Calorías de hoy" />

      {day.meals.length > 0 && (
        <ul className={group}>
          {day.meals.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-1.5 pl-4 pr-1">
              <span className="min-w-0">
                <span className="block truncate text-[16px] font-medium">{m.name}</span>
                <span className="text-[13px] text-mute">{m.kcal} kcal{m.proteinG !== null ? ` · ${Math.round(m.proteinG)} g proteína` : ""}{m.source === "foto" ? " · por foto" : ""}</span>
              </span>
              <button type="button" aria-label={`Quitar ${m.name}`} onClick={() => actions.removeMeal(today, m.id)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-mute hover:text-fg">
                <Icon name="x" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]">
          <label className="flex flex-col gap-1 text-xs text-mute">Comida
            <input className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ej. tacos de asada" maxLength={80} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-mute">Calorías
            <input className={input} inputMode="decimal" value={draft.kcal} onChange={(e) => setDraft({ ...draft, kcal: e.target.value })} placeholder="kcal" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-mute">Proteína (opcional)
            <input className={input} inputMode="decimal" value={draft.protein} onChange={(e) => setDraft({ ...draft, protein: e.target.value })} placeholder="g" />
          </label>
        </div>
        {draft.estimate && (
          <div className="rounded-2xl bg-well p-3 text-xs text-mute">
            <p className="mb-1 font-semibold text-fg">Estimación del Nutri · confianza {draft.estimate.confidence}</p>
            <ul className="mb-1">
              {draft.estimate.items.map((it, i) => <li key={i}>{it.food} ({it.portion}): {it.kcal} kcal</li>)}
            </ul>
            <p>{draft.estimate.note} Es una estimación: corrige los números si sabes que no cuadran.</p>
          </div>
        )}
        {msg && <p role="status" className="text-sm text-amber">{msg}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={btn.primary}>Guardar comida</button>
          <button type="button" className={btn.ghost} disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="camera" size={18} />{busy ? "El Nutri está viendo la foto…" : "Calcular con foto"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Foto de la comida" onChange={(e) => void onPhoto(e.target.files?.[0])} />
        </div>
      </form>
    </Card>
  );
}
