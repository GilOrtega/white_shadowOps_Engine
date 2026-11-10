import { z } from "zod";
import { EngineError } from "./errors";

/**
 * Variables de entorno del Engine, validadas una sola vez (lazy) para que
 * el build de Next no truene si faltan en tiempo de compilación.
 */
const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY es requerida"),
  WSO_MINER_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
  WSO_API_SECRET: z.string().min(16).optional(),
});

export type EngineEnv = z.infer<typeof EnvSchema>;

let cached: EngineEnv | undefined;

export function getEngineEnv(): EngineEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new EngineError("CONFIG_INVALID", z.prettifyError(parsed.error));
  }
  cached = parsed.data;
  return cached;
}
