import { rankVideos, type TrendVideo, topicById } from "../trends";
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
    throw new Error(`youtube:${reason}`);
  }
  return (json?.items ?? []) as Record<string, unknown>[];
}

export async function trendingFor(topicId: string, opts: { region?: string; f?: Fetch; now?: number } = {}): Promise<{ videos: TrendVideo[]; cached: boolean }> {
  const topic = topicById(topicId);
  if (!topic) throw new Error("topic");
  const region = opts.region ?? "MX";
  const f = opts.f ?? fetch;
  const now = opts.now ?? Date.now();
  const cacheKey = `wso:yt:${region}:${topic.id}`;
  if (kvConfigured()) {
    const hit = await kvGet<TrendVideo[]>(cacheKey);
    if (hit) return { videos: hit, cached: true };
  }
  let ids: string[];
  if (topic.yt.category) {
    const items = await get(f, "videos", { part: "snippet,statistics,contentDetails", chart: "mostPopular", regionCode: region, videoCategoryId: topic.yt.category, maxResults: "25" });
    const videos = rankVideos(items as never, now).slice(0, 15);
    if (kvConfigured()) await kvSet(cacheKey, videos, TTL);
    return { videos, cached: false };
  } else {
    const after = new Date(now - 7 * 24 * 3_600_000).toISOString();
    const found = await get(f, "search", { part: "id", type: "video", q: topic.yt.query!, order: "viewCount", publishedAfter: after, regionCode: region, relevanceLanguage: "es", maxResults: "25" });
    ids = found.map((x) => (x.id as { videoId?: string } | undefined)?.videoId).filter((x): x is string => Boolean(x));
  }
  if (!ids.length) return { videos: [], cached: false };
  const items = await get(f, "videos", { part: "snippet,statistics,contentDetails", id: ids.join(",") });
  const videos = rankVideos(items as never, now).slice(0, 15);
  if (kvConfigured()) await kvSet(cacheKey, videos, TTL);
  return { videos, cached: false };
}
