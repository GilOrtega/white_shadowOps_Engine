/**
 * Editor de Shorts (corre en GitHub Actions; el repo es público, así que NO imprime URLs ni textos).
 * 1. Pide el trabajo a WhiteShadow.  2. Baja los clips.  3. Transcribe cada uno con Whisper.
 * 4. Los pone en vertical y los junta.  5. Quema subtítulos, gancho y "DÍA X DE 60".
 * 6. Sube el resultado a Vercel Blob y avisa a la app.
 *
 * Variables: JOB_ID, WSO_URL, WSO_API_SECRET.  Uso: npx tsx engine/render-short.ts
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { upload } from "@vercel/blob/client";
import { probeVideo } from "../src/engine/media/ffmpeg";
import { SubtitleStyleSchema } from "../src/engine/media/schemas";
import { buildAss } from "../src/engine/media/subtitles";
import { concatList, finalArgs, mergeWords, normalizeArgs, OUT, ShortJobSchema } from "../src/engine/shorts/plan";
import type { Word } from "../src/engine/schemas/transcript";

const run = promisify(execFile);
const JOB_ID = process.env.JOB_ID ?? "";
const BASE = (process.env.WSO_URL ?? "").replace(/\/$/, "");
const KEY = process.env.WSO_API_SECRET ?? "";
const WORK = join(process.cwd(), ".short-work");

const log = (msg: string) => console.log(`[short ${JOB_ID}] ${msg}`);

async function api(method: "GET" | "PATCH", body?: unknown) {
  const res = await fetch(`${BASE}/api/engine/jobs/${JOB_ID}`, {
    method,
    headers: { "x-wso-key": KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`La app respondió ${res.status}`);
  return (await res.json()) as { job: unknown };
}
const stage = (s: string) => api("PATCH", { action: "stage", stage: s }).catch(() => null);

async function ffmpeg(args: string[]) {
  await run("ffmpeg", args, { maxBuffer: 16 * 1024 * 1024 });
}

async function main() {
  if (!/^[a-z0-9]{6,24}$/.test(JOB_ID) || !BASE || !KEY) throw new Error("Faltan JOB_ID, WSO_URL o WSO_API_SECRET");
  const job = ShortJobSchema.parse((await api("GET")).job);
  await mkdir(WORK, { recursive: true });

  await stage("Bajando tus clips");
  const raws: string[] = [];
  for (const [i, c] of job.clips.entries()) {
    const res = await fetch(c.url);
    if (!res.ok) throw new Error(`No se pudo bajar el clip ${i + 1}`);
    const file = join(WORK, `raw${i}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    raws.push(file);
  }
  log(`${raws.length} clips`);

  await stage("Poniendo en vertical");
  const normalized: string[] = [];
  for (const [i, raw] of raws.entries()) {
    const p = await probeVideo(raw);
    const out = join(WORK, `norm${i}.mp4`);
    await ffmpeg(normalizeArgs(raw, out, { hasAudio: p.hasAudio, vertical: p.height >= p.width }));
    normalized.push(out);
  }

  await stage("Transcribiendo tu voz");
  const parts: { words: Word[]; durationSec: number }[] = [];
  const texts: string[] = [];
  for (const [i, file] of normalized.entries()) {
    const p = await probeVideo(file);
    const wav = join(WORK, `a${i}.wav`);
    const json = join(WORK, `t${i}.json`);
    await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", file, "-vn", "-ac", "1", "-ar", "16000", wav]);
    await run("python", ["engine/transcribe.py", wav, json], { maxBuffer: 16 * 1024 * 1024 });
    const t = JSON.parse(await readFile(json, "utf8")) as { words: Word[]; text: string };
    parts.push({ words: t.words, durationSec: p.durationSec });
    if (t.text) texts.push(t.text);
  }
  const merged = mergeWords(parts);
  log(`${merged.words.length} palabras, ${merged.durationSec.toFixed(1)} s`);

  await stage("Subtítulos y gancho");
  const ass = buildAss({
    words: merged.words,
    clipStart: 0,
    clipEnd: merged.durationSec,
    style: SubtitleStyleSchema.parse({}),
    width: OUT.width,
    height: OUT.height,
    hook: job.hook ? { text: job.hook, durationSec: 2.8 } : null,
    badge: job.badge || null,
  });
  const assFile = join(WORK, "subs.ass");
  await writeFile(assFile, ass, "utf8");
  const list = join(WORK, "list.txt");
  await writeFile(list, concatList(normalized));
  const final = join(WORK, "short.mp4");
  await ffmpeg(finalArgs(list, assFile, final));

  await stage("Subiendo tu Short");
  const blob = await upload(`shorts/out/${job.id}.mp4`, new Blob([await readFile(final)], { type: "video/mp4" }), {
    access: "public",
    handleUploadUrl: `${BASE}/api/engine/upload`,
    clientPayload: JSON.stringify({ key: KEY }),
    multipart: true,
    contentType: "video/mp4",
  });
  await api("PATCH", {
    action: "done",
    result: { url: blob.url, pathname: blob.pathname, durationSec: Math.round(merged.durationSec * 10) / 10 },
    transcript: texts.join(" ").slice(0, 4000),
  });
  log("listo");
}

main().catch(async (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[short ${JOB_ID}] falló: ${msg.slice(0, 200)}`);
  await api("PATCH", { action: "fail", error: `El editor falló: ${msg}`.slice(0, 300) }).catch(() => null);
  process.exit(1);
});
