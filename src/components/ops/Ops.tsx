"use client";

import { Fragment, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AGENTS, progressOf, TEMPLATES } from "@/ops/engine";
import type { AutoSettings, Mission, OpsAction, Task } from "@/ops/schemas";
import type { HqState } from "@/hq/schemas";
import { actions, useHq } from "@/hq/store";
import { useToday } from "@/hq/useToday";
import { TONE } from "../hq/CommandCenter";
import { MascotFace } from "../hq/Mascot";
import { btn, Icon, Loading, PageTitle } from "../hq/ui";

/* Operaciones: le das una misión al equipo y trabajan en el servidor aunque cierres la app. */

type Api<T> = { ok: true; data: T } | { ok: false; status: number; code: string; message: string };
async function api<T>(path: string, key: string, init?: { method?: string; body?: unknown }): Promise<Api<T>> {
  try {
    const res = await fetch(path, { method: init?.method ?? "GET", headers: { "Content-Type": "application/json", "x-wso-key": key }, body: init?.body ? JSON.stringify(init.body) : undefined, cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as T & { code?: string; message?: string };
    if (res.ok) return { ok: true, data: json };
    return { ok: false, status: res.status, code: json.code ?? "ERROR", message: json.message ?? "El servidor no respondió." };
  } catch {
    return { ok: false, status: 0, code: "NETWORK", message: "Sin conexión." };
  }
}

const now$ = { subscribe: (cb: () => void) => { const id = setInterval(cb, 1000); return () => clearInterval(id); }, get: () => Math.floor(Date.now() / 1000) * 1000 };
const useNow = () => useSyncExternalStore(now$.subscribe, now$.get, () => 0);

export function Ops() {
  const hq = useHq();
  const today = useToday();
  if (!hq || !today) return <Loading />;
  return <OpsView hq={hq} today={today} />;
}

export function OpsView({ hq, today, initial = null }: { hq: HqState; today: string; initial?: Mission[] | null }) {
  const key = hq.accessKey;
  const [missions, setMissions] = useState<Mission[] | null>(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(initial?.[0]?.id ?? null);
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState<AutoSettings | null>(null);
  const running = missions?.some((m) => m.status === "planning" || m.status === "running") ?? false;

  const load = useCallback(async () => {
    if (!key) return;
    const r = await api<{ missions: Mission[] }>("/api/ops/missions", key);
    if (r.ok) {
      setMissions(r.data.missions);
      setProblem(null);
      setSelected((s) => s ?? r.data.missions[0]?.id ?? null);
    } else setProblem(r.code === "NOT_CONFIGURED" ? "Falta conectar Upstash Redis en Vercel (Storage) para que los agentes guarden su trabajo." : r.code === "UNAUTHORIZED" ? "Tu clave de acceso no coincide con WSO_API_SECRET (Ajustes → Agentes con IA)." : r.message);
  }, [key]);

  useEffect(() => {
    if (!key || process.env.WSO_STATIC) return;
    const first = window.setTimeout(() => {
      void load();
      void api<{ auto: AutoSettings }>("/api/ops/auto", key).then((r) => r.ok && setAuto(r.data.auto));
    }, 0);
    return () => window.clearTimeout(first);
  }, [key, load]);
  useEffect(() => {
    if (!key || process.env.WSO_STATIC) return;
    const id = window.setInterval(() => void load(), running ? 2500 : 20000);
    return () => window.clearInterval(id);
  }, [key, load, running]);

  async function launch(text: string) {
    if (text.trim().length < 8 || busy) return;
    setBusy(true);
    const r = await api<{ mission: Mission }>("/api/ops/missions", key, { method: "POST", body: { goal: text } });
    setBusy(false);
    if (r.ok) {
      setGoal("");
      setMissions((m) => [r.data.mission, ...(m ?? [])]);
      setSelected(r.data.mission.id);
    } else setProblem(r.code === "NOT_CONFIGURED" ? "Falta configurar el servidor: ANTHROPIC_API_KEY, WSO_API_SECRET y Upstash Redis en Vercel." : r.message);
  }

  async function retry(id: string) {
    const r = await api<{ mission: Mission }>(`/api/ops/missions/${id}`, key, { method: "POST" });
    if (r.ok) setMissions((ms) => (ms ?? []).map((m) => (m.id === id ? r.data.mission : m)));
  }

  async function toggleAuto(patch: Partial<AutoSettings>) {
    const next = { weekly: false, daily: false, ...auto, ...patch };
    setAuto(next);
    await api("/api/ops/auto", key, { method: "PUT", body: next });
  }

  const mission = missions?.find((m) => m.id === selected) ?? missions?.[0] ?? null;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Operaciones" sub="Dale una misión al equipo · trabajan aunque cierres la app" />

      <section aria-labelledby="new-h" className="glass flex flex-col gap-3 rounded-[26px] p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-end justify-center rounded-2xl bg-iris/15"><MascotFace mood={running ? "listo" : "fuego"} thinking={running} size={38} /></span>
          <div>
            <h2 id="new-h" className="text-[17px] font-semibold tracking-tight">Nueva misión</h2>
            <p className="text-[12px] text-mute">Sombra la reparte entre Coach, Nutri, Estratega y Copywriter. Te aviso cuando terminen.</p>
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void launch(goal); }} className="flex flex-col gap-2 sm:flex-row">
          <textarea aria-label="Misión" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={400} rows={2}
            placeholder="Ej. Plan para entregar la Landing de Aura Homes el viernes sin dejar el gym"
            className="min-h-14 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-[15px] outline-none focus:border-iris/50" />
          <button type="submit" disabled={busy || goal.trim().length < 8 || !key} className={`${btn.primary} sm:self-stretch`}><Icon name="rocket" size={18} />{busy ? "Lanzando…" : "Lanzar"}</button>
        </form>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {TEMPLATES.map((t) => <button key={t.title} type="button" onClick={() => setGoal(t.goal)} className={`${btn.chip} min-h-9 text-[13px]`}>{t.title}</button>)}
        </div>
        {!key && <p className="rounded-xl bg-amber/10 px-3 py-2 text-[13px] text-amber">Pon tu clave de acceso en Ajustes → Agentes con IA para poner a trabajar al equipo.</p>}
        {problem && <p role="alert" className="rounded-xl bg-amber/10 px-3 py-2 text-[13px] text-amber">{problem}</p>}
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[0.06] pt-3 text-[13px]">
          <span className="font-semibold text-mute">Automáticas:</span>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--iris)]" disabled={!auto} checked={auto?.weekly ?? false} onChange={(e) => void toggleAuto({ weekly: e.target.checked })} />Plan de la semana (lunes ~7 am)</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--iris)]" disabled={!auto} checked={auto?.daily ?? false} onChange={(e) => void toggleAuto({ daily: e.target.checked })} />Briefing diario (~7 am)</label>
        </div>
      </section>

      {missions && missions.length > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <nav aria-label="Misiones" className="glass flex flex-col gap-1 rounded-[22px] p-2">
            {missions.map((m) => (
              <button key={m.id} type="button" onClick={() => setSelected(m.id)} aria-current={mission?.id === m.id ? "true" : undefined}
                className={`flex flex-col gap-1.5 rounded-2xl px-3 py-2.5 text-left ${mission?.id === m.id ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"}`}>
                <span className="line-clamp-2 text-[13px] font-medium leading-snug">{m.goal}</span>
                <span className="flex items-center gap-2 text-[11px] text-mute">
                  <StatusDot m={m} />{STATUS[m.status]}{m.origin !== "manual" ? " · auto" : ""}
                  <span className="ml-auto tnum">{progressOf(m)}%</span>
                </span>
              </button>
            ))}
          </nav>
          {mission && <MissionDetail key={mission.id} m={mission} hq={hq} today={today} onRetry={() => void retry(mission.id)} />}
        </div>
      )}
      {missions && missions.length === 0 && <p className="text-center text-[14px] text-mute">Aún no hay misiones. Empieza con “Plan de la semana”.</p>}
    </div>
  );
}

const STATUS: Record<Mission["status"], string> = { planning: "Sombra planeando", running: "Trabajando", done: "Entregada", failed: "Se detuvo" };
function StatusDot({ m }: { m: Mission }) {
  const c = m.status === "done" ? "bg-accent" : m.status === "failed" ? "bg-danger" : "bg-sky wso-pulse";
  return <span aria-hidden="true" className={`h-2 w-2 rounded-full ${c}`} />;
}

const EXPECTED_MS = 25_000;
function MissionDetail({ m, hq, today, onRetry }: { m: Mission; hq: HqState; today: string; onRetry: () => void }) {
  const now = useNow();
  const pct = progressOf(m);
  const [applied, setApplied] = useState<number[]>([]);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="glass flex flex-col gap-3 rounded-[22px] p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-iris">{STATUS[m.status]}{m.origin !== "manual" ? " · misión automática" : ""}</p>
            <h2 className="text-[19px] font-semibold leading-snug tracking-tight">{m.goal}</h2>
          </div>
          {m.status === "failed" || m.tasks.some((t) => t.status === "failed") ? <button type="button" className={btn.ghost} onClick={onRetry}>Reintentar</button> : null}
        </div>
        <div role="progressbar" aria-label="Avance de la misión" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
          <div className={`h-full rounded-full bg-iris transition-[width] duration-700 ${m.status === "running" || m.status === "planning" ? "wso-shimmer" : ""}`} style={{ width: `${Math.max(pct, 4)}%` }} />
        </div>
        {m.error && <p role="alert" className="text-[13px] text-danger">{m.error}</p>}
        {m.status === "planning" && <p className="text-[13px] text-mute">Sombra está repartiendo la misión entre el equipo…</p>}
      </section>

      {m.tasks.length > 0 && (
        <ol className="grid gap-3 md:grid-cols-2">
          {m.tasks.map((t) => <AgentCard key={t.id} t={t} now={now} />)}
        </ol>
      )}

      {m.status === "done" && (
        <section aria-labelledby={`sum-${m.id}`} className="glass flex flex-col gap-3 rounded-[22px] border border-iris/25 p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-end justify-center rounded-xl bg-iris/15"><MascotFace mood="fiesta" size={30} /></span>
            <h3 id={`sum-${m.id}`} className="text-[17px] font-semibold tracking-tight">Plan de ataque de Sombra</h3>
            <CopyButton text={[m.summary, ...m.tasks.filter((t) => t.output).map((t) => `\n\n## ${AGENTS[t.agent].name}: ${t.title}\n\n${t.output}`)].join("")} label="Copiar todo" />
          </div>
          <Markdown text={m.summary} />
          {m.actions.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-mute">Aplicar a tu centro de mando</p>
              {m.actions.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2 text-[14px]">
                  <span className="min-w-0">{actionLabel(a)}</span>
                  <button type="button" disabled={applied.includes(i)} onClick={() => { applyAction(a, hq, today); setApplied([...applied, i]); }}
                    className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-[13px] font-semibold text-ink disabled:bg-white/[0.08] disabled:text-mute">{applied.includes(i) ? "Aplicado" : "Aplicar"}</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function AgentCard({ t, now }: { t: Task; now: number }) {
  const a = AGENTS[t.agent];
  const tone = TONE[a.facet];
  const [open, setOpen] = useState(false);
  const elapsed = t.startedAt ? (t.endedAt ?? (now || t.startedAt)) - t.startedAt : 0;
  const pct = t.status === "done" ? 100 : t.status === "running" ? Math.min(92, Math.round((elapsed / EXPECTED_MS) * 90) + 5) : t.status === "failed" ? 100 : 0;
  const pill = t.status === "done" ? ["Entregado", "bg-accent/15 text-accent"] : t.status === "running" ? ["Trabajando", "bg-sky/15 text-sky"] : t.status === "failed" ? ["Falló", "bg-danger/15 text-danger"] : ["En fila", "bg-white/[0.06] text-mute"];
  return (
    <li className={`glass flex min-w-0 flex-col gap-3 rounded-[22px] p-4 ${t.status === "running" ? "ring-1 ring-sky/40" : ""}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[20px] ${tone.soft}`} aria-hidden="true">{a.emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-tight">{a.name}</span>
          <span className="block truncate text-[12px] text-mute">{a.role}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${pill[1]}`}>{pill[0]}</span>
      </div>
      <p className="text-[14px] font-medium leading-snug">{t.title}</p>
      <div>
        <div role="progressbar" aria-label={`Avance de ${a.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
          <div className={`h-full rounded-full transition-[width] duration-1000 ${t.status === "failed" ? "bg-danger" : t.status === "done" ? "bg-accent" : "bg-sky"} ${t.status === "running" ? "wso-shimmer" : ""}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 flex justify-between text-[11px] text-mute">
          <span>{t.status === "running" ? `${Math.round(elapsed / 1000)} s` : t.status === "done" && t.startedAt && t.endedAt ? `${Math.round((t.endedAt - t.startedAt) / 1000)} s` : t.status === "pending" ? "Esperando su turno" : ""}</span>
          <span className="tnum">{t.tokens ? `${t.tokens.toLocaleString("es-MX")} tokens` : ""}</span>
        </p>
      </div>
      {t.error && <p className="text-[12px] text-danger">{t.error}</p>}
      {t.output && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(!open)} className={`${btn.chip} min-h-9 text-[13px]`}>{open ? "Ocultar entregable" : "Ver entregable"}</button>
            <CopyButton text={t.output} label="Copiar" />
          </div>
          {open && <div className="max-h-[28rem] overflow-y-auto rounded-2xl bg-white/[0.03] p-4"><Markdown text={t.output} /></div>}
        </div>
      )}
    </li>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-mute hover:text-fg"
      onClick={() => void navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }).catch(() => {})}>
      <Icon name="copy" size={14} />{ok ? "¡Copiado!" : label}
    </button>
  );
}

function actionLabel(a: OpsAction): string {
  if (a.kind === "habit") return `${a.emoji} Nuevo hábito: ${a.title}${a.time ? ` a las ${a.time}` : ""}${a.anchor ? ` (después de ${a.anchor})` : ""}`;
  if (a.kind === "project") return `📁 Proyecto: ${a.name}${a.client ? ` · ${a.client}` : ""}${a.due ? ` · entrega ${a.due}` : ""}`;
  return `🎯 Meta de enfoque: ${a.value} bloques al día`;
}

function applyAction(a: OpsAction, hq: HqState, today: string) {
  if (a.kind === "habit") actions.addHabit({ title: a.title, emoji: a.emoji || "✅", time: a.time, anchor: a.anchor, days: [0, 1, 2, 3, 4, 5, 6], kind: "hacer", facet: "cuerpo" }, today);
  else if (a.kind === "project") actions.addProject({ name: a.name, client: a.client, due: a.due });
  else actions.setWork({ focusGoal: a.value });
  void hq;
}

/** Markdown mínimo y seguro (sin HTML): títulos, listas, negritas y párrafos. */
export function Markdown({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold text-fg">{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list;
    blocks.push(L.ordered
      ? <ol key={blocks.length} className="ml-5 list-decimal space-y-1">{L.items.map((x, i) => <li key={i}>{inline(x)}</li>)}</ol>
      : <ul key={blocks.length} className="ml-5 list-disc space-y-1 marker:text-mute">{L.items.map((x, i) => <li key={i}>{inline(x)}</li>)}</ul>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)/);
    const num = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (bullet || num) {
      const ordered = Boolean(num);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? num)![1]!);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) blocks.push(<p key={blocks.length} className={`${h[1]!.length <= 2 ? "text-[16px]" : "text-[15px]"} mt-2 font-semibold text-fg first:mt-0`}>{inline(h[2]!)}</p>);
    else blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="flex flex-col gap-2 text-[14px] leading-relaxed text-fg/85">{blocks}</div>;
}
