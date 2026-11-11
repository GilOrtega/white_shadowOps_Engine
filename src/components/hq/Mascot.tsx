"use client";

import { useState } from "react";
import type { MascotAnswer, MascotRequest } from "@/hq/agents/mascota";
import { callAgent } from "@/hq/client";
import * as L from "@/hq/logic";
import type { HqState } from "@/hq/schemas";
import { btn, input } from "./ui";

/**
 * Sombra, la mascota original de WhiteShadow: un fantasma blanco con banda de gym.
 * Dibujo con volumen (luz arriba, sombra abajo), mejillas y brillo en los ojos; cambia de cara según el ánimo.
 */
export function MascotFace({ mood, size = 96 }: { mood: L.Mood; size?: number }) {
  const happy = mood === "fiesta";
  const eyes = happy ? (
    <g fill="none" stroke="#111" strokeWidth="3.4" strokeLinecap="round"><path d="M40 60q7-9 14 0" /><path d="M66 60q7-9 14 0" /></g>
  ) : (
    <g>
      <ellipse cx="47" cy="60" rx="6.5" ry={mood === "preocupado" ? 7 : 8.5} fill="#111" />
      <ellipse cx="73" cy="60" rx="6.5" ry={mood === "preocupado" ? 7 : 8.5} fill="#111" />
      <circle cx="49.5" cy="56.5" r="2.6" fill="#fff" /><circle cx="75.5" cy="56.5" r="2.6" fill="#fff" />
      <circle cx="45" cy="63" r="1.2" fill="#c6f432" /><circle cx="71" cy="63" r="1.2" fill="#c6f432" />
    </g>
  );
  const brows =
    mood === "fuego" ? <g fill="none" stroke="#111" strokeWidth="3.4" strokeLinecap="round"><path d="M38 46l15 5" /><path d="M82 46l-15 5" /></g>
    : mood === "preocupado" ? <g fill="none" stroke="#111" strokeWidth="3.4" strokeLinecap="round"><path d="M39 49l13-5" /><path d="M81 49l-13-5" /></g>
    : null;
  const mouth =
    happy ? <path d="M50 72q10 14 20 0z" fill="#111" />
    : mood === "preocupado" ? <path d="M53 79q7-6 14 0" fill="none" stroke="#111" strokeWidth="3.4" strokeLinecap="round" />
    : mood === "fuego" ? <path d="M52 75q8 3 16 0" fill="none" stroke="#111" strokeWidth="3.4" strokeLinecap="round" />
    : <path d="M52 73q8 8 16 0" fill="none" stroke="#111" strokeWidth="3.4" strokeLinecap="round" />;
  const armsUp = happy || mood === "fuego";
  const body = "M60 12c22 0 35 16 35 37v56q-8.75 9-17.5 0-8.75-9-17.5 0-8.75 9-17.5 0-8.75-9-17.5 0V49C25 28 38 12 60 12z";
  return (
    <svg width={size} height={(size * 132) / 120} viewBox="0 0 120 132" role="img" aria-label={`Sombra, ánimo: ${mood}`}>
      <ellipse className="wso-shadow fill-fg" cx="60" cy="124" rx="30" ry="5" opacity="0.2" />
      <g className={happy ? "wso-bounce" : "wso-float"}>
        <g fill="none" className="stroke-ghost" strokeWidth="11" strokeLinecap="round">
          {armsUp ? <><path d="M29 68q-16-6-15-23" /><path d="M91 68q16-6 15-23" /></> : <><path d="M29 70q-12 4-15 15" /><path d="M91 70q12 4 15 15" /></>}
        </g>
        <path d={body} className="fill-ghost stroke-edge" strokeWidth="1.5" />
        {/* volumen: sombra suave abajo a la derecha y luz arriba a la izquierda */}
        <path d="M95 49v56q-8.75 9-17.5 0-4-4-8-4c14-8 20-24 20-44 0-12-3-22-9-30 9 6 14.5 16 14.5 22z" className="fill-ghost-shade" opacity="0.55" />
        <path d="M38 34q6-12 18-15" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
        <path d="M27 41q33-11 66 0v-9q-33-11-66 0z" fill="#c6f432" />
        <path d="M27 41q33-11 66 0v-3q-33-11-66 0z" fill="#000" opacity="0.12" />
        <ellipse cx="38" cy="72" rx="6" ry="3.5" fill="#ff8fa3" opacity="0.55" /><ellipse cx="82" cy="72" rx="6" ry="3.5" fill="#ff8fa3" opacity="0.55" />
        {eyes}{brows}{mouth}
        {mood === "fuego" && <path d="M108 18c1 6 7 8 7 15a7 7 0 0 1-14 0c0-2 1-4 2.5-5 0 2 1 3.5 2.5 2.5 1-4 0-8 2-12.500z" fill="#ff9f43" />}
        {mood === "preocupado" && <path d="M90 44q4 6 0 10-4-4 0-10z" fill="#6cb4ff" />}
      </g>
    </svg>
  );
}

type Msg = { from: "yo" | "mascota"; text: string };
const ASKS: { id: L.MascotAsk; label: string }[] = [
  { id: "ahora", label: "¿Qué hago ahorita?" },
  { id: "animo", label: "Dame ánimo" },
  { id: "sin_ganas", label: "No tengo ganas" },
];

function context(hq: HqState, today: string): MascotRequest["context"] {
  const info = L.challengeInfo(hq.profile, today);
  const prog = L.progress(hq);
  return {
    name: hq.profile.name, mascotName: hq.profile.mascotName, dayNumber: info.dayNumber, daysLeft: info.daysLeft,
    streak: L.streak(hq, today), completeDays: prog.completeDays, rank: L.rankInfo(prog.xp).name,
    missionsLeft: L.missionsFor(hq, today).filter((m) => m.required && !m.done).map((m) => m.title),
    training: L.trainingFor(hq.plan, today).title, kcal: L.kcalOf(L.dayOf(hq, today)), calorieTarget: hq.profile.calorieTarget, stake: hq.profile.stake,
  };
}

const theirs = "self-start rounded-[20px] rounded-bl-md bg-well px-4 py-2.5 text-[16px] leading-snug";
const mine = "max-w-[85%] self-end rounded-[20px] rounded-br-md bg-lime px-4 py-2.5 text-[16px] font-medium leading-snug text-ink";

export function Mascot({ hq, today, hour }: { hq: HqState; today: string; hour: number }) {
  const opening = L.mascotLine(hq, today, hour);
  const [chat, setChat] = useState<Msg[]>([]);
  const [mood, setMood] = useState<L.Mood | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const name = hq.profile.mascotName;

  function quick(ask: (typeof ASKS)[number]) {
    const r = L.mascotReply(ask.id, hq, today);
    setChat((c) => [...c, { from: "yo", text: ask.label }, { from: "mascota", text: r.text }]);
    setMood(r.mood);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    const history = chat.slice(-8);
    setChat((c) => [...c, { from: "yo", text: message }]);
    setText("");
    setBusy(true);
    const res = await callAgent<MascotAnswer>("/api/agents/mascota", { message, history, context: context(hq, today) }, hq.accessKey);
    setBusy(false);
    if (res.ok) {
      setChat((c) => [...c, { from: "mascota", text: res.data.reply }]);
      setMood(res.data.mood);
    } else {
      const why = res.code === "NOT_CONFIGURED" || res.code === "UNAUTHORIZED" ? "Para platicar libre conmigo falta activar la IA. Mientras, usa mis botones: esos siempre jalan." : res.message;
      setChat((c) => [...c, { from: "mascota", text: why }]);
    }
  }

  return (
    <section aria-label={`${name}, tu mascota`} className="flex flex-col gap-4 rounded-3xl bg-panel p-5">
      <div className="flex items-end gap-3">
        <div className="flex h-[8.5rem] w-[7.5rem] shrink-0 items-end justify-center rounded-[28px] bg-accent/12 pb-1">
          <MascotFace mood={mood ?? opening.mood} size={108} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pb-1">
          <p className="pl-1 text-[13px] font-semibold text-mute">{name}</p>
          <p className={theirs}>{opening.text}</p>
        </div>
      </div>
      {(chat.length > 0 || busy) && (
        <div aria-live="polite" className="flex flex-col gap-2">
          {chat.map((m, i) => <p key={i} className={`wso-in ${m.from === "yo" ? mine : theirs}`}>{m.text}</p>)}
          {busy && <p className="pl-1 text-sm text-mute">{name} está escribiendo…</p>}
        </div>
      )}
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        {ASKS.map((a) => <button key={a.id} type="button" className={btn.chip} onClick={() => quick(a)}>{a.label}</button>)}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input aria-label={`Escríbele a ${name}`} className={`${input} rounded-full px-4`} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={`Escríbele a ${name}`} />
        <button type="submit" aria-label="Enviar" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-lime text-ink disabled:opacity-40" disabled={busy || !text.trim()}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" /></svg>
        </button>
      </form>
    </section>
  );
}
