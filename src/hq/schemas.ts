import { z } from "zod";

/** Modelo de datos del centro de mando. Todo lo que se guarda pasa por estos esquemas. */
export const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD");

export const ProfileSchema = z.object({
  name: z.string().trim().min(1).max(40).default("Buddy"),
  startDate: DateStr.default("2026-10-23"),
  challengeDays: z.number().int().min(7).max(365).default(60),
  startWeightKg: z.number().min(30).max(300).default(87.95),
  goalWeightKg: z.number().min(30).max(300).nullable().default(null),
  /** Meta diaria. El piso de 1500 es a propósito: el plan es conservador. */
  calorieTarget: z.number().int().min(1500).max(5000).default(2100),
  /** Lo que te juegas: se ve todos los días en la pantalla de inicio. */
  stake: z.string().trim().max(80).default("Si fallo, me rapo con la 0."),
  /** Foto de perfil ya reducida (data URL JPEG de ~192 px). */
  photo: z.string().max(80_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/).nullable().default(null),
  mascotName: z.string().trim().min(1).max(20).default("Sombra"),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const GoalSchema = z.enum(["bajar", "musculo", "ambas"]);
export const TimeSchema = z.enum(["manana", "tarde", "noche"]);
export const ContentSchema = z.enum(["diario", "tres", "resultado"]);

export const PlanSchema = z.object({
  goal: GoalSchema,
  /** Días de gym, 0 = lunes … 6 = domingo. */
  gymDays: z.array(z.number().int().min(0).max(6)).min(1).max(6),
  time: TimeSchema,
  content: ContentSchema,
  createdAt: z.string(),
});
export type Plan = z.infer<typeof PlanSchema>;

export const MealSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  kcal: z.number().int().min(0).max(5000),
  proteinG: z.number().min(0).max(400).nullable().default(null),
  source: z.enum(["manual", "foto"]).default("manual"),
  at: z.string(),
});
export type Meal = z.infer<typeof MealSchema>;

export const FeelingSchema = z.enum(["con_todo", "normal", "fundido"]);
export type Feeling = z.infer<typeof FeelingSchema>;

export const DayLogSchema = z.object({
  date: DateStr,
  trainingDone: z.boolean().default(false),
  clipDone: z.boolean().default(false),
  weightKg: z.number().min(30).max(300).nullable().default(null),
  feeling: FeelingSchema.nullable().default(null),
  meals: z.array(MealSchema).max(30).default([]),
  /** Trabajo: bloques de enfoque (≈50 min sin distracciones) completados. */
  focusBlocks: z.number().int().min(0).max(20).default(0),
});
export type DayLog = z.infer<typeof DayLogSchema>;

// --- facetas del centro de mando (además del Cuerpo, que es el reto) -----------------------
export const ProjectSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(60),
  client: z.string().trim().max(60).default(""),
  due: DateStr.nullable().default(null),
  done: z.boolean().default(false),
});
export type Project = z.infer<typeof ProjectSchema>;

export const WorkSchema = z.object({
  focusGoal: z.number().int().min(1).max(8).default(2),
  projects: z.array(ProjectSchema).max(30).default([]),
});

export const IncomeSchema = z.object({
  id: z.string().min(1).max(40),
  date: DateStr,
  amount: z.number().positive().max(10_000_000),
  note: z.string().trim().max(60).default(""),
});
export type Income = z.infer<typeof IncomeSchema>;

export const MoneySchema = z.object({
  /** Meta de ingresos del mes, en pesos. null = aún sin meta. */
  monthlyGoal: z.number().positive().max(10_000_000).nullable().default(null),
  entries: z.array(IncomeSchema).max(1000).default([]),
});

export const BrandSchema = z.object({
  /** Clips publicados/aprobados por semana. */
  weeklyClips: z.number().int().min(1).max(21).default(3),
});

export const HqStateSchema = z.object({
  v: z.literal(1).default(1),
  profile: ProfileSchema.prefault({}),
  plan: PlanSchema.nullable().default(null),
  days: z.record(DateStr, DayLogSchema).default({}),
  /** Clave para usar los agentes con IA (se compara en el servidor con WSO_API_SECRET). */
  accessKey: z.string().max(200).default(""),
  work: WorkSchema.prefault({}),
  money: MoneySchema.prefault({}),
  brand: BrandSchema.prefault({}),
});
export type HqState = z.infer<typeof HqStateSchema>;

export const defaultState = (): HqState => HqStateSchema.parse({});
