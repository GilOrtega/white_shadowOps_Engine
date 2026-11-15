import assert from "node:assert/strict";
import { parseDuration, rankVideos, nicheFrom, fmtCount, ago, TOPICS, isSpanish } from "../src/hq/trends";
import { trendingFor } from "../src/hq/server/youtube";

assert.equal(parseDuration("PT1M5S"), 65);
assert.equal(parseDuration("PT2H"), 7200);
assert.equal(parseDuration("P1DT1S"), 86401);
assert.equal(parseDuration("bad"), 0);
assert.equal(nicheFrom(["gym"]), "gym y transformación física");
assert.equal(nicheFrom(["gym", "tecnologia", "videojuegos"]), "gym y transformación física, tecnología y videojuegos");
assert.equal(fmtCount(1500), "2 mil");
assert.equal(fmtCount(2_300_000), "2.3 M");
assert.equal(TOPICS.length, 5);
// Idioma: declarado gana; si no, por el título
assert.equal(isSpanish({ id: "x", snippet: { title: "Workout", defaultAudioLanguage: "es-419" } }), true);
assert.equal(isSpanish({ id: "x", snippet: { title: "CONHECENDO ZIGGY DA MANSÃO" } }), false);
assert.equal(isSpanish({ id: "x", snippet: { title: "Así fue mi transformación física" } }), true);
assert.equal(isSpanish({ id: "x", snippet: { title: "Can Yaman's Daily Routine Is INSANE" } }), false);

const now = Date.parse("2026-11-14T12:00:00Z");
const v = (id: string, hoursAgo: number, views: number, dur = "PT45S", lang = "es") => ({
  id, snippet: { title: id, channelTitle: "c", defaultAudioLanguage: lang, publishedAt: new Date(now - hoursAgo * 3_600_000).toISOString(), thumbnails: { medium: { url: "t" } } },
  statistics: { viewCount: String(views) }, contentDetails: { duration: dur },
});
const ranked = rankVideos([v("viejo", 720, 1_000_000, "PT10M"), v("nuevo", 10, 200_000), { id: "roto", snippet: { publishedAt: "x" }, statistics: { viewCount: "5" } }], now);
assert.deepEqual(ranked.map((r) => r.id), ["nuevo", "viejo"], "velocidad gana a total; datos rotos fuera");
assert.equal(ranked[0]!.perHour, 20_000);
assert.equal(ranked[0]!.isShort, true);
assert.equal(ranked[1]!.isShort, false);
assert.equal(ago(new Date(now - 5 * 3_600_000).toISOString(), now), "hace 5 h");
assert.equal(ago(new Date(now - 24 * 3_600_000).toISOString(), now), "hace 1 día");

process.env.YOUTUBE_API_KEY = "test";
delete process.env.KV_REST_API_URL;
const calls: string[] = [];
const fake = (async (url: string) => {
  calls.push(url);
  const u = new URL(url);
  if (u.pathname.endsWith("/search")) return new Response(JSON.stringify({ items: [{ id: { videoId: "a" } }, { id: { videoId: "b" } }, { id: { videoId: "pt" } }] }));
  return new Response(JSON.stringify({ items: [v("a", 5, 1000), v("b", 5, 9000), v("pt", 5, 99000, "PT45S", "pt-BR")] }));
}) as unknown as typeof fetch;

(async () => {
  const gym = await trendingFor("gym", { f: fake, now });
  assert.deepEqual(gym.videos.map((x) => x.id), ["b", "a"], "solo español, ordenado por velocidad");
  assert.equal(calls.filter((c) => c.includes("/search")).length, 3, "tres búsquedas cortas");
  assert.ok(calls[0]!.includes("regionCode=MX") && calls[0]!.includes("publishedAfter=") && calls[0]!.includes("relevanceLanguage=es"));
  assert.ok(calls[3]!.includes("id=a%2Cb%2Cpt"), "ids sin repetir");
  calls.length = 0;
  await trendingFor("tecnologia", { f: fake, now });
  assert.equal(calls.length, 1, "categoría = una sola llamada barata");
  assert.ok(calls[0]!.includes("chart=mostPopular") && calls[0]!.includes("videoCategoryId=28"));
  const bad = (async () => new Response(JSON.stringify({ error: { errors: [{ reason: "quotaExceeded" }] } }), { status: 403 })) as unknown as typeof fetch;
  await assert.rejects(trendingFor("gym", { f: bad, now }), /quotaExceeded/);
  const badKey = (async () => new Response(JSON.stringify({ error: { message: "API key not valid. Please pass a valid key.", errors: [{ reason: "badRequest" }] } }), { status: 400 })) as unknown as typeof fetch;
  await assert.rejects(trendingFor("gym", { f: badKey, now }), /badRequest API key not valid/);
  await assert.rejects(trendingFor("nada", { f: fake, now }), /topic/);
  console.log("trends selftest ok");
})();
