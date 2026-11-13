import { z } from "zod";

export const ActivitySchema = z.enum(["sedentario", "ligero", "moderado", "alto"]);
export type Activity = z.infer<typeof ActivitySchema>;

export const NutritionSchema = z.object({
  heightCm: z.number().int().min(120).max(230).nullable().default(null),
  age: z.number().int().min(18).max(90).nullable().default(null),
  sex: z.enum(["h", "m"]).nullable().default(null),
  /** null = se deduce de tus días de gym. */
  activity: ActivitySchema.nullable().default(null),
  /** Platillos que no quieres que te sugiera (ids del recetario). */
  skip: z.array(z.string().max(40)).max(60).default([]),
  /** Cambios en el menú: `${semana}:${día}:${tiempo}` → id del platillo. */
  swaps: z.record(z.string().max(40), z.string().max(40)).default({}),
});
export type Nutrition = z.infer<typeof NutritionSchema>;

