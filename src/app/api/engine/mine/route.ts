import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AnthropicStructuredLlm, isEngineError, mineClips, MinerOptionsSchema } from "@/engine";

// Runtime Node.js (default en Next 16; con cacheComponents no se declara "runtime").
// Para transcripciones de hasta ~1 h. Streams más largos van por la cola (Fase 3).
export const maxDuration = 300;

const BodySchema = z.object({
  transcript: z.unknown(),
  options: MinerOptionsSchema.partial().optional(),
});

function authorized(req: Request): boolean {
  const secret = process.env.WSO_API_SECRET;
  if (!secret) return false;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const STATUS: Record<string, number> = {
  INPUT_INVALID: 400,
  CONFIG_INVALID: 500,
  LLM_REFUSED: 422,
  LLM_OUTPUT_INVALID: 502,
  LLM_OUTPUT_TRUNCATED: 502,
  LLM_REQUEST_FAILED: 503,
  ABORTED: 499,
  INTERNAL_CONTRACT: 500,
  TRANSCRIPTION_FAILED: 502,
};

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "INPUT_INVALID", message: "Body JSON inválido" }, { status: 400 });
  }

  try {
    const result = await mineClips(new AnthropicStructuredLlm(), body.transcript, body.options, req.signal);
    return Response.json(result, { status: 200 });
  } catch (err) {
    if (isEngineError(err)) {
      console.error("[engine/mine]", err.code, err.message);
      return Response.json(err.toJSON(), { status: STATUS[err.code] ?? 500 });
    }
    console.error("[engine/mine] unexpected", err);
    return Response.json({ error: "INTERNAL" }, { status: 500 });
  }
}
