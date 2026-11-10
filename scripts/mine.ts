/**
 * CLI del Miner (para correr local sin límites de Vercel).
 *   npx tsx --env-file=.env.local scripts/mine.ts ./transcript.json [--context "stream de Next.js"]
 */
import { readFile, writeFile } from "node:fs/promises";
import { AnthropicStructuredLlm, isEngineError, mineClips } from "../src/engine";

async function main() {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) {
    console.error("Uso: tsx scripts/mine.ts <transcript.json> [--context \"...\"]");
    process.exit(1);
  }
  const ctxIdx = rest.indexOf("--context");
  const context = ctxIdx >= 0 ? rest[ctxIdx + 1] : undefined;

  const transcript = JSON.parse(await readFile(file, "utf8"));
  const ac = new AbortController();
  process.on("SIGINT", () => ac.abort());

  const result = await mineClips(new AnthropicStructuredLlm(), transcript, { context }, ac.signal);

  const out = file.replace(/\.json$/, "") + ".clips.json";
  await writeFile(out, JSON.stringify(result, null, 2));

  console.table(
    result.clips.map((c) => ({ start: c.startTime, end: c.endTime, dur: c.duration, score: c.scores.final, hook: c.hookText })),
  );
  console.log(`\n${result.clips.length} clips → ${out}`, result.stats);
  if (result.windowErrors.length) console.warn("Ventanas con error:", result.windowErrors);
}

main().catch((err) => {
  console.error(isEngineError(err) ? `${err.code}: ${err.message}` : err);
  process.exit(1);
});
