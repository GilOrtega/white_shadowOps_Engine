import { checkKey, deny } from "@/hq/server/auth";
import { trendingFor, youtubeConfigured } from "@/hq/server/youtube";
import { topicById } from "@/hq/trends";

/** Videos que van en ascenso en YouTube México para un tema. */
export async function GET(req: Request) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  const topic = new URL(req.url).searchParams.get("topic") ?? "";
  if (!topicById(topic)) return Response.json({ code: "INPUT_INVALID", message: "Tema desconocido." }, { status: 400 });
  if (!youtubeConfigured()) return Response.json({ code: "NOT_CONFIGURED", message: "Falta YOUTUBE_API_KEY en Vercel (llave gratis de Google Cloud con YouTube Data API v3)." }, { status: 503 });
  try {
    return Response.json(await trendingFor(topic));
  } catch (err) {
    const reason = String(err instanceof Error ? err.message : err);
    console.error("[trends/youtube]", reason);
    if (/quota/i.test(reason)) return Response.json({ code: "QUOTA", message: "Se acabó la cuota de YouTube de hoy. Vuelve mañana." }, { status: 502 });
    if (/key not valid|keyInvalid|API_KEY_INVALID/i.test(reason)) return Response.json({ code: "BAD_KEY", message: "YouTube dice que la llave no es válida. Revisa YOUTUBE_API_KEY en Vercel (sin espacios ni comillas) y haz Redeploy." }, { status: 502 });
    if (/blocked|accessNotConfigured|forbidden|has not been used|disabled/i.test(reason)) return Response.json({ code: "API_OFF", message: "La llave no tiene permiso para YouTube Data API v3. Revisa que la API esté habilitada y que la restricción de la llave la incluya." }, { status: 502 });
    return Response.json({ code: "UPSTREAM", message: "YouTube no respondió. Intenta en un rato." }, { status: 502 });
  }
}
