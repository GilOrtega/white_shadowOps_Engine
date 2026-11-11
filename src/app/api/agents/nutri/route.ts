import { AnthropicStructuredLlm, isEngineError } from "@/engine";
import { estimateMeal, NutriRequestSchema } from "@/hq/agents/nutri";
import { checkAgentAccess, deny } from "@/hq/server/auth";

export const maxDuration = 60;

export async function POST(req: Request) {
  const access = checkAgentAccess(req);
  if (!access.ok) return deny(access);

  const body = NutriRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ code: "INPUT_INVALID", message: "Foto inválida o demasiado grande." }, { status: 400 });

  try {
    return Response.json(await estimateMeal(new AnthropicStructuredLlm(), body.data, req.signal));
  } catch (err) {
    console.error("[agents/nutri]", isEngineError(err) ? `${err.code} ${err.message}` : err);
    return Response.json({ code: "AGENT_FAILED", message: "El Nutri no pudo leer la foto. Intenta de nuevo o regístrala a mano." }, { status: 502 });
  }
}
