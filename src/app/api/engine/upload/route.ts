import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { normalizeKey } from "@/hq/server/auth";
import { MAX_CLIP_BYTES } from "@/engine/shorts/plan";

/**
 * Da permiso para subir videos directo del celular (o del editor) a Vercel Blob,
 * sin pasar por esta función (que solo acepta ~4.5 MB). Pide la clave de acceso en clientPayload.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const secret = normalizeKey(process.env.WSO_API_SECRET);
        let key = "";
        try {
          key = normalizeKey((JSON.parse(clientPayload ?? "{}") as { key?: string }).key);
        } catch {
          /* clientPayload inválido: se rechaza abajo */
        }
        if (!secret || key !== secret) throw new Error("UNAUTHORIZED");
        if (!/^shorts\/(raw|out)\//.test(pathname)) throw new Error("PATH");
        return {
          allowedContentTypes: ["video/*"],
          maximumSizeInBytes: MAX_CLIP_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "UNAUTHORIZED") return Response.json({ code: "UNAUTHORIZED", message: "Clave de acceso incorrecta." }, { status: 401 });
    if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ code: "NOT_CONFIGURED", message: "Falta conectar Vercel Blob al proyecto (Storage → Blob)." }, { status: 503 });
    console.error("[engine/upload]", msg.slice(0, 120));
    return Response.json({ code: "UPLOAD", message: "No se pudo autorizar la subida." }, { status: 400 });
  }
}
