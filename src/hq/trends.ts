/**
 * Tendencias: temas con un toque para el Radar y videos de YouTube que van en ascenso.
 * "En ascenso" = vistas por hora desde que se publicó (velocidad), no solo vistas totales:
 * así un video de ayer con 200 mil vistas le gana a uno de hace un mes con 1 millón.
 */
export type TopicId = "gym" | "tecnologia" | "ia" | "motivacion" | "videojuegos";

export const TOPICS: { id: TopicId; label: string; emoji: string; niche: string; yt: { category?: string; queries?: string[] } }[] = [
  { id: "gym", label: "Gym", emoji: "🏋️", niche: "gym y transformación física", yt: { queries: ["rutina gym", "transformación física", "motivación gym"] } },
  { id: "tecnologia", label: "Tecnología", emoji: "💻", niche: "tecnología", yt: { category: "28" } },
  { id: "ia", label: "Programar con IA", emoji: "🤖", niche: "programación con inteligencia artificial", yt: { queries: ["programar con IA", "inteligencia artificial programación", "crear app con IA"] } },
  { id: "motivacion", label: "Motivación", emoji: "🔥", niche: "motivación y disciplina", yt: { queries: ["motivación disciplina", "hábitos disciplina", "mentalidad"] } },
  { id: "videojuegos", label: "Videojuegos", emoji: "🎮", niche: "videojuegos", yt: { category: "20" } },
];

/** Para búsquedas: debajo de esto no se considera "en ascenso" (si quedan suficientes). */
export const MIN_PER_HOUR = 100;
export const topicById = (id: string) => TOPICS.find((t) => t.id === id) ?? null;

/** Junta los temas elegidos en una frase para el Radar. */
export function nicheFrom(ids: TopicId[]) {
  const names = ids.map((id) => topicById(id)!.niche);
  if (!names.length) return "";
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

export type TrendVideo = {
  id: string;
  title: string;
  channel: string;
  thumb: string;
  publishedAt: string;
  views: number;
  likes: number | null;
  comments: number | null;
  durationSec: number;
  /** Vistas por hora desde que se publicó. */
  perHour: number;
  isShort: boolean;
  url: string;
};

/** ISO 8601 de YouTube (PT1M5S) → segundos. */
export function parseDuration(iso: string) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, mi, s] = m;
  return (Number(d ?? 0) * 86400) + (Number(h ?? 0) * 3600) + (Number(mi ?? 0) * 60) + Number(s ?? 0);
}

type YtVideo = {
  id: string;
  snippet?: { title?: string; description?: string; channelTitle?: string; publishedAt?: string; defaultLanguage?: string; defaultAudioLanguage?: string; thumbnails?: Record<string, { url?: string }> };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
};

const PT = /[ãõ]|\b(você|não|muito|então|treino|também|mansão)\b/i;
const ES = /[ñ¿¡]|\b(el|la|los|las|de|que|cómo|como|para|con|mi|tu|tus|mis|por|más|una|uno|rutina|día|cuerpo|hábitos)\b/i;

/** ¿Está en español? Usa el idioma que declara el video; si no lo declara, lo deduce del título. */
export function isSpanish(v: YtVideo) {
  const lang = (v.snippet?.defaultAudioLanguage ?? v.snippet?.defaultLanguage ?? "").toLowerCase();
  if (lang) return lang.startsWith("es");
  const text = `${v.snippet?.title ?? ""} ${(v.snippet?.description ?? "").slice(0, 200)}`;
  if (PT.test(text)) return false;
  return ES.test(text);
}

/** Convierte la respuesta de videos.list y ordena por velocidad. */
export function rankVideos(items: YtVideo[], now: number): TrendVideo[] {
  return items
    .flatMap((v) => {
      const published = v.snippet?.publishedAt ? Date.parse(v.snippet.publishedAt) : NaN;
      const views = Number(v.statistics?.viewCount ?? NaN);
      if (!v.id || !Number.isFinite(published) || !Number.isFinite(views)) return [];
      const hours = Math.max(1, (now - published) / 3_600_000);
      const durationSec = parseDuration(v.contentDetails?.duration ?? "");
      const t = v.snippet?.thumbnails ?? {};
      return [{
        id: v.id,
        title: (v.snippet?.title ?? "").slice(0, 200),
        channel: (v.snippet?.channelTitle ?? "").slice(0, 100),
        thumb: t.medium?.url ?? t.high?.url ?? t.default?.url ?? "",
        publishedAt: new Date(published).toISOString(),
        views,
        likes: v.statistics?.likeCount ? Number(v.statistics.likeCount) : null,
        comments: v.statistics?.commentCount ? Number(v.statistics.commentCount) : null,
        durationSec,
        perHour: Math.round(views / hours),
        isShort: durationSec > 0 && durationSec <= 180,
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`,
      }];
    })
    .sort((a, b) => b.perHour - a.perHour);
}

export const fmtCount = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} M` : n >= 1_000 ? `${Math.round(n / 1_000)} mil` : String(n);

export function ago(iso: string, now: number) {
  const h = Math.max(0, (now - Date.parse(iso)) / 3_600_000);
  if (h < 1) return "hace menos de 1 h";
  if (h < 24) return `hace ${Math.round(h)} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}
