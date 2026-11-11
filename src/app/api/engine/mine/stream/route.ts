import { z } from "zod";
import { AnthropicStructuredLlm, isEngineError, mineClips, MinerOptionsSchema, type StructuredLlm } from "@/engine";
import { demoLlm, demoTranscript } from "@/engine/demo/fake";
import type { MineEvent } from "@/crew/schemas";
import { checkAgentAccess, deny } from "@/hq/server/auth";

/**
 * Miner con avance en vivo (Server-Sent Events sobre POST).
 * La app lee el stream y mueve la barra de cada ventana conforme Claude termina.
 * `demo: true` usa el LLM falso y no gasta tu API key (para probar el flujo).
 */
export const maxDuration = 300;

const BodySchema = z.object({
  transcript: z.unknown().optional(),
  options: MinerOptionsSchema.partial().optional(),
  demo: z.boolean().optional(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const slowDemo: StructuredLlm = {
  async generate(req) {
    await sleep(450); // solo para que en la demo se vea el avance; el LLM real tarda lo que tarde
    return demoLlm.generate(req);
  },
};

export async function POST(req: Request) {
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ code: "INPUT_INVALID", message: "Body inválido." }, { status: 400 });
  const demo = body.data.demo === true;
  if (!demo) {
    const access = checkAgentAccess(req);
    if (!access.ok) return deny(access);
  }

  const llm = demo ? slowDemo : new AnthropicStructuredLlm();
  const transcript = demo ? demoTranscript() : body.data.transcript;
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: MineEvent) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* el cliente se fue */
        }
      };
      try {
        const res = await mineClips(llm, transcript, { ...body.data.options, ...(demo ? { minFinalScore: 55 } : {}) }, req.signal, {
          onStart: (i) => send({ type: "start", ...i }),
          onWindow: (i) => send({ type: "window", ...i }),
        });
        send({
          type: "result", clips: res.clips, dropped: res.dropped.length,
          inputTokens: res.stats.inputTokens, outputTokens: res.stats.outputTokens, elapsedMs: res.stats.elapsedMs,
        });
      } catch (err) {
        console.error("[engine/mine/stream]", isEngineError(err) ? `${err.code} ${err.message}` : err);
        send(isEngineError(err)
          ? { type: "error", code: err.code, message: err.code === "INPUT_INVALID" ? `La transcripción no es válida: ${err.message.slice(0, 200)}` : "El Miner no pudo terminar. Intenta de nuevo." }
          : { type: "error", code: "INTERNAL", message: "Error inesperado en el Miner." });
      } finally {
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
