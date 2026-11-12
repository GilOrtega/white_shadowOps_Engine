import { z } from "zod";

/**
 * Operaciones: misiones que los agentes trabajan en el servidor aunque cierres la app.
 * Sombra planea, cada agente entrega un documento, Sombra cierra con el plan de ataque.
 */
export const AgentIdSchema = z.enum(["coach", "nutri", "estratega", "copywriter", "sombra"]);
export type AgentId = z.infer<typeof AgentIdSchema>;

export const TaskStatusSchema = z.enum(["pending", "running", "done", "failed"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSchema = z.object({
  id: z.string().max(20),
  agent: AgentIdSchema,
  title: z.string().max(100),
  brief: z.string().max(600),
  status: TaskStatusSchema,
  startedAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  /** Entregable en markdown. */
  output: z.string().max(12000).default(""),
  tokens: z.number().int().min(0).default(0),
  error: z.string().max(300).nullable().default(null),
});
export type Task = z.infer<typeof TaskSchema>;

/** Acciones que el resumen puede proponer para tu centro de mando (las aplicas tú). */
export const OpsActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("habit"), title: z.string().max(50), emoji: z.string().max(8), time: z.string().regex(/^\d{2}:\d{2}$/).nullable(), anchor: z.string().max(60) }),
  z.object({ kind: z.literal("project"), name: z.string().max(60), client: z.string().max(60), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }),
  z.object({ kind: z.literal("focusGoal"), value: z.number().int().min(1).max(8) }),
]);
export type OpsAction = z.infer<typeof OpsActionSchema>;

export const MissionStatusSchema = z.enum(["planning", "running", "done", "failed"]);
export type MissionStatus = z.infer<typeof MissionStatusSchema>;

export const MissionSchema = z.object({
  v: z.literal(1).default(1),
  id: z.string().max(40),
  goal: z.string().max(400),
  origin: z.enum(["manual", "auto-semana", "auto-dia"]).default("manual"),
  createdAt: z.number(),
  updatedAt: z.number(),
  status: MissionStatusSchema,
  tasks: z.array(TaskSchema).max(6).default([]),
  summary: z.string().max(8000).default(""),
  actions: z.array(OpsActionSchema).max(6).default([]),
  error: z.string().max(300).nullable().default(null),
  /** Cuántas veces se reanudó (para no ciclarse si algo falla siempre). */
  attempts: z.number().int().min(0).default(0),
});
export type Mission = z.infer<typeof MissionSchema>;

export const AutoSettingsSchema = z.object({
  weekly: z.boolean().default(false),
  daily: z.boolean().default(false),
});
export type AutoSettings = z.infer<typeof AutoSettingsSchema>;
