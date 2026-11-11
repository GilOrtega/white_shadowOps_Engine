"use client";

import { useRef, useState } from "react";
import { ProfileSchema, type HqState } from "@/hq/schemas";
import { fileToAvatar } from "@/hq/client";
import { actions, parseNumber, useHq } from "@/hq/store";
import { PushCard } from "./PushCard";
import { btn, Card, H2, input, Loading, PageTitle } from "./ui";

export function Settings() {
  const hq = useHq();
  if (!hq) return <Loading />;
  return <SettingsView hq={hq} />;
}

export function SettingsView({ hq }: { hq: HqState }) {
  const p = hq.profile;
  const [f, setF] = useState({
    name: p.name, startDate: p.startDate, challengeDays: String(p.challengeDays), startWeightKg: String(p.startWeightKg),
    goalWeightKg: p.goalWeightKg === null ? "" : String(p.goalWeightKg), calorieTarget: String(p.calorieTarget), stake: p.stake, mascotName: p.mascotName,
  });
  const [key, setKey] = useState(hq.accessKey);
  const [msg, setMsg] = useState<{ where: "perfil" | "clave" | "datos"; text: string; ok: boolean } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [backupUrl, setBackupUrl] = useState<string | null>(null);
  const [backupText, setBackupText] = useState("");
  const [restoreText, setRestoreText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const note = (where: "perfil" | "clave" | "datos") => msg?.where === where && <p role="status" className={`text-sm ${msg.ok ? "text-accent" : "text-amber"}`}>{msg.text}</p>;

  function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const parsed = ProfileSchema.safeParse({
      name: f.name, startDate: f.startDate, challengeDays: parseNumber(f.challengeDays), startWeightKg: parseNumber(f.startWeightKg),
      goalWeightKg: f.goalWeightKg.trim() ? parseNumber(f.goalWeightKg) : null, calorieTarget: parseNumber(f.calorieTarget), stake: f.stake, mascotName: f.mascotName, photo: hq.profile.photo,
    });
    if (!parsed.success) {
      return setMsg({ where: "perfil", ok: false, text: "Revisa los datos: el reto dura de 7 a 365 días, el peso va de 30 a 300 kg y la meta de calorías de 1,500 a 5,000." });
    }
    actions.updateProfile(parsed.data);
    setMsg({ where: "perfil", ok: true, text: "Guardado." });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Ajustes" sub="Tu reto, tus agentes y tus datos" />

      <Card aria-labelledby="perfil-h">
        <form onSubmit={saveProfile} className="flex flex-col gap-4">
          <H2 id="perfil-h">Tu reto</H2>
          <div className="flex flex-wrap items-center gap-4">
            {hq.profile.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- foto local en data URL
              <img src={hq.profile.photo} alt="Tu foto" width={72} height={72} className="h-18 w-18 rounded-full object-cover" />
            ) : (
              <span aria-hidden="true" className="flex h-18 w-18 items-center justify-center rounded-full bg-well font-display text-2xl font-bold text-mute">{hq.profile.name.charAt(0)}</span>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn.ghost} onClick={() => photoRef.current?.click()}>{hq.profile.photo ? "Cambiar foto" : "Poner mi foto"}</button>
              {hq.profile.photo && <button type="button" className={btn.ghost} onClick={() => actions.updateProfile({ photo: null })}>Quitar</button>}
              <input ref={photoRef} type="file" accept="image/*" className="sr-only" aria-label="Tu foto de perfil" onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  actions.updateProfile({ photo: await fileToAvatar(file) });
                  setMsg({ where: "perfil", ok: true, text: "Foto guardada en este navegador." });
                } catch {
                  setMsg({ where: "perfil", ok: false, text: "No se pudo leer esa imagen. Prueba con otra." });
                }
              }} />
            </div>
            <p className="basis-full text-xs text-mute">La foto se guarda solo en este navegador; no se sube a ningún servidor.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-mute">Nombre<input className={input} value={f.name} onChange={set("name")} maxLength={40} /></label>
            <label className="flex flex-col gap-1 text-xs text-mute">Día 1 del reto<input type="date" className={input} value={f.startDate} onChange={set("startDate")} /></label>
            <label className="flex flex-col gap-1 text-xs text-mute">Duración (días)<input className={input} inputMode="numeric" value={f.challengeDays} onChange={set("challengeDays")} /></label>
            <label className="flex flex-col gap-1 text-xs text-mute">Peso inicial (kg)<input className={input} inputMode="decimal" value={f.startWeightKg} onChange={set("startWeightKg")} /></label>
            <label className="flex flex-col gap-1 text-xs text-mute">Peso meta (kg, opcional)<input className={input} inputMode="decimal" value={f.goalWeightKg} onChange={set("goalWeightKg")} /></label>
            <label className="flex flex-col gap-1 text-xs text-mute">Meta de calorías al día<input className={input} inputMode="numeric" value={f.calorieTarget} onChange={set("calorieTarget")} /></label>
            <label className="flex flex-col gap-1 text-xs text-mute sm:col-span-2 lg:col-span-3">Tu apuesta (se ve todos los días)<input className={input} value={f.stake} onChange={set("stake")} maxLength={80} /></label>
            <label className="flex flex-col gap-1 text-xs text-mute">Nombre de tu mascota<input className={input} value={f.mascotName} onChange={set("mascotName")} maxLength={20} /></label>
          </div>
          <p className="text-xs text-mute">La meta de calorías de arranque (2,100) es una referencia moderada, no una receta. Si tu nutriólogo te da otra, pon la suya: su plan manda. El mínimo permitido aquí es 1,500.</p>
          <div className="flex flex-wrap items-center gap-3"><button type="submit" className={btn.primary}>Guardar</button>{note("perfil")}</div>
        </form>
      </Card>

      <Card aria-labelledby="ia-h" className="flex flex-col gap-3">
        <H2 id="ia-h">Agentes con IA</H2>
        <p className="text-sm text-fg/85">El Nutri (calorías por foto) y el análisis del Coach usan tu cuenta de Anthropic, así que solo funcionan con tu clave de acceso. Para activarlos:</p>
        <ol className="flex list-inside list-decimal flex-col gap-1 text-sm text-fg/85">
          <li>En Vercel → Settings → Environment Variables agrega <code className="text-accent">ANTHROPIC_API_KEY</code> y <code className="text-accent">WSO_API_SECRET</code> (una frase larga que tú inventes).</li>
          <li>Vuelve a desplegar el proyecto.</li>
          <li>Escribe aquí esa misma frase de <code className="text-accent">WSO_API_SECRET</code>.</li>
        </ol>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); actions.setAccessKey(key.trim()); setMsg({ where: "clave", ok: true, text: "Clave guardada en este navegador." }); }}>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-mute">Clave de acceso
            <input type="password" autoComplete="off" className={input} value={key} onChange={(e) => setKey(e.target.value)} maxLength={200} />
          </label>
          <button type="submit" className={btn.ghost}>Guardar clave</button>
        </form>
        {note("clave")}
        <p className="text-xs text-mute">Sin clave todo lo demás funciona igual: registras comidas a mano y el Coach te habla con sus reglas fijas.</p>
      </Card>

      <PushCard hq={hq} />

      <Card aria-labelledby="datos-h" className="flex flex-col gap-3">
        <H2 id="datos-h">Tus datos</H2>
        <p className="text-sm text-fg/85">Por ahora todo se guarda en este navegador. Si cambias de teléfono o borras los datos del navegador, se pierden: baja un respaldo de vez en cuando.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn.ghost} onClick={() => {
            const json = actions.exportJson();
            setBackupText(json);
            if (!process.env.WSO_STATIC) {
              if (backupUrl) URL.revokeObjectURL(backupUrl);
              setBackupUrl(URL.createObjectURL(new Blob([json], { type: "application/json" })));
            }
          }}>Preparar respaldo</button>
          {backupUrl && <a className={btn.primary} href={backupUrl} download="whiteshadow-respaldo.json">Descargar respaldo</a>}
          {backupText && <button type="button" className={btn.primary} onClick={async () => {
            try {
              await navigator.clipboard.writeText(backupText);
              setMsg({ where: "datos", ok: true, text: "Respaldo copiado. Pégalo en tus notas o mándatelo por mensaje." });
            } catch {
              setMsg({ where: "datos", ok: false, text: "No se pudo copiar solo: selecciona el texto del cuadro y cópialo a mano." });
            }
          }}>Copiar respaldo</button>}
          {!process.env.WSO_STATIC && <button type="button" className={btn.ghost} onClick={() => fileRef.current?.click()}>Restaurar desde archivo</button>}
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Archivo de respaldo" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const res = actions.importJson(await file.text());
            setMsg({ where: "datos", ok: res.ok, text: res.ok ? "Respaldo restaurado." : res.message });
            e.target.value = "";
          }} />
        </div>
        {backupText && <textarea readOnly aria-label="Tu respaldo" className={`${input} h-28 py-2 font-mono text-xs`} value={backupText} onFocus={(e) => e.target.select()} />}
        <label className="flex flex-col gap-1 text-xs text-mute">Restaurar: pega aquí un respaldo
          <textarea className={`${input} h-20 py-2 font-mono text-xs`} value={restoreText} onChange={(e) => setRestoreText(e.target.value)} placeholder='{"v":1,...}' />
        </label>
        <button type="button" className={`${btn.ghost} self-start`} disabled={!restoreText.trim()} onClick={() => {
          const res = actions.importJson(restoreText);
          setMsg({ where: "datos", ok: res.ok, text: res.ok ? "Respaldo restaurado." : res.message });
          if (res.ok) setRestoreText("");
        }}>Restaurar lo pegado</button>
        {note("datos")}
        <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          {!confirmReset ? (
            <button type="button" className="min-h-11 text-sm text-danger underline" onClick={() => setConfirmReset(true)}>Borrar todo y empezar de cero</button>
          ) : (
            <>
              <span className="text-sm">Se borran tu plan, comidas y pesajes de este navegador. No se puede deshacer.</span>
              <button type="button" className={`${btn.ghost} text-danger`} onClick={() => { actions.reset(); setConfirmReset(false); setMsg({ where: "datos", ok: true, text: "Datos borrados." }); }}>Sí, borrar</button>
              <button type="button" className={btn.ghost} onClick={() => setConfirmReset(false)}>Cancelar</button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
