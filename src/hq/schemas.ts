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
  /** Hábitos marcados ese día (ids). Para los de "evitar", marcado = lo cumpliste (no lo hiciste). */
  habitsDone: z.array(z.string().max(40)).max(40).default([]),
  /** Pendientes de solo ese día que agregaste tú. */
  todos: z.array(z.object({
    id: z.string().min(1).max(40),
    title: z.string().trim().min(1).max(80),
    done: z.boolean().default(false),
  })).max(30).default([]),
  /** Registro del gym: ejercicio → peso de trabajo y reps por serie. */
  lifts: z.record(z.string().max(30), z.object({
    kg: z.number().min(0).max(600).nullable().default(null),
    reps: z.array(z.number().int().min(0).max(300)).max(8).default([]),
  })).default({}),
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

// --- hábitos y recordatorios (habit stacking) --------------------------------------------
export const HabitSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().trim().min(1).max(50),
  emoji: z.string().max(8).default("✅"),
  /** Hora del recordatorio "HH:MM" (hora local). null = sin aviso. */
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  /** Días de la semana (0 = lunes … 6 = domingo). */
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([0, 1, 2, 3, 4, 5, 6]),
  /** Ancla: "después de…" (habit stacking). */
  anchor: z.string().trim().max(60).default(""),
  /** "hacer" = algo que sumas; "evitar" = algo que dejas (no refresco). */
  kind: z.enum(["hacer", "evitar"]).default("hacer"),
  facet: z.enum(["cuerpo", "mente", "trabajo", "marca", "dinero"]).default("cuerpo"),
  createdAt: DateStr,
});
export type Habit = z.infer<typeof HabitSchema>;

export const BrandSchema = z.object({
  /** Clips publicados/aprobados por semana. */
  weeklyClips: z.number().int().min(1).max(21).default(3),
});

/** Semana de contenido: 7 días × 3 formatos (guion de video, carrusel, historia). */
export const ContentFormatSchema = z.enum(["guion", "carrusel", "historia"]);
export type ContentFormat = z.infer<typeof ContentFormatSchema>;
export const ContentItemSchema = z.object({
  id: z.string().min(1).max(40),
  /** 0 = lunes … 6 = domingo. */
  day: z.number().int().min(0).max(6),
  format: ContentFormatSchema,
  title: z.string().trim().min(1).max(90),
  /** Gancho de los primeros 3 segundos / portada / pregunta de la historia. */
  hook: z.string().max(200).default(""),
  /** Guion por partes, láminas del carrusel o secuencia de la historia (una por línea). */
  beats: z.array(z.string().max(240)).max(10).default([]),
  cta: z.string().max(140).default(""),
  pillar: z.string().max(60).default(""),
  status: z.enum(["idea", "listo", "publicado"]).default("idea"),
});
export type ContentItem = z.infer<typeof ContentItemSchema>;
export const ContentWeekSchema = z.object({
  /** Tus temas fijos: de qué hablas siempre. */
  pillars: z.array(z.string().trim().min(2).max(60)).max(6).default(["Reto físico: si fallo, me rapo", "Programar con IA", "Mindset y disciplina"]),
  /** Lunes de la semana planeada (YYYY-MM-DD) o null si aún no hay plan. */
  weekOf: DateStr.nullable().default(null),
  items: z.array(ContentItemSchema).max(21).default([]),
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
  contentWeek: ContentWeekSchema.prefault({}),
  /** Ejercicio de la rutina → el que usas en su lugar (id de la biblioteca de técnica). */
  exerciseSwaps: z.record(z.string().max(30), z.string().regex(/^\d{4}$/)).default({}),
  habits: z.array(HabitSchema).max(24).default([]),
  /** Propuestas de los agentes que descartaste: id → fecha (vuelven a salir si cambian los datos). */
  dismissed: z.record(z.string().max(80), DateStr).default({}),
});
export type HqState = z.infer<typeof HqStateSchema>;

export const defaultState = (): HqState => HqStateSchema.parse({});
