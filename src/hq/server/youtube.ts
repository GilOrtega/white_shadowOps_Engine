import { isSpanish, MIN_PER_HOUR, rankVideos, type TrendVideo, topicById } from "../trends";
import { kvConfigured, kvGet, kvSet } from "./kv";

/**
 * YouTube Data API v3 (gratis: 10,000 unidades al día).
 * Categoría → videos.list chart=mostPopular (1 unidad). Búsqueda → search.list (100) + videos.list (1).
 * Se guarda 3 h en la nube para no gastar cuota.
 */
const API = "https://www.googleapis.com/youtube/v3";
const TTL = 3 * 60 * 60;

export const youtubeConfigured = () => Boolean(process.env.YOUTUBE_API_KEY?.trim());

type Fetch = typeof fetch;

async function get(f: Fetch, path: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY!.trim() });
  const res = await f(`${API}/${path}?${qs}`, { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as { items?: unknown[]; error?: { message?: string; errors?: { reason?: string }[] } } | null;
  if (!res.ok) {
    const reason = json?.error?.errors?.[0]?.reason ?? String(res.status);
    const detail = (json?.error?.message ?? "").replace(/key=[^&\s]+/g, "key=***").slice(0, 160);
    throw new Error(`youtube:${reason} ${detail}`.trim());
  }
  return (json?.items ?? []) as Record<string, unknown>[];
}

export async function trendingFor(topicId: string, opts: { region?: string; f?: Fetch; now?: number } = {}): Promise<{ videos: TrendVideo[]; cached: boolean }> {
  const topic = topicById(topicId);
  if (!topic) throw new Error("topic");
  const region = opts.region ?? "MX";
  const f = opts.f ?? fetch;
  const now = opts.now ?? Date.now();
  const cacheKey = `wso:yt:v2:${region}:${topic.id}`;
  if (kvConfigured()) {
    const hit = await kvGet<TrendVideo[]>(cacheKey);
    if (hit) return { videos: hit, cached: true };
  }
  const part = "snippet,statistics,contentDetails";
  let videos: TrendVideo[];
  if (topic.yt.category) {
    const items = await get(f, "videos", { part, chart: "mostPopular", regionCode: region, videoCategoryId: topic.yt.category, maxResults: "25" });
    videos = rankVideos(items as never, now).slice(0, 15);
  } else {
    // Varias búsquedas cortas (más naturales que una sola larga), solo en español y de los últimos 7 días.
    const after = new Date(now - 7 * 24 * 3_600_000).toISOString();
    const found = await Promise.all(topic.yt.queries!.map((q) =>
      get(f, "search", { part: "id", type: "video", q, order: "viewCount", publishedAfter: after, regionCode: region, relevanceLanguage: "es", maxResults: "20" })));
    const ids = [...new Set(found.flat().map((x) => (x.id as { videoId?: string } | undefined)?.videoId).filter((x): x is string => Boolean(x)))].slice(0, 50);
    if (!ids.length) return { videos: [], cached: false };
    const items = (await get(f, "videos", { part, id: ids.join(",") })) as Parameters<typeof isSpanish>[0][];
    const ranked = rankVideos(items.filter(isSpanish) as never, now);
    const rising = ranked.filter((v) => v.perHour >= MIN_PER_HOUR);
    videos = (rising.length >= 5 ? rising : ranked).slice(0, 15);
  }
  if (kvConfigured()) await kvSet(cacheKey, videos, TTL);
  return { videos, cached: false };
}
