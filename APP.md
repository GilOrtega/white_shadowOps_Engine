# WhiteShadow — Centro de mando

La app (Next.js 16) que vive encima del motor de shorts (`ENGINE.md`).

## Pantallas
- `/` Hoy: resumen, plan de ataque del día, preguntas de los agentes, comidas, entrenamiento y equipo de agentes.
- `/plan` El Estratega te entrevista (4 preguntas) y arma tu semana.
- `/progreso` Tendencia de peso (promedio de 7 días), estadísticas y últimos 14 días.
- `/engine` Estado del motor de shorts y demostración.
- `/ajustes` Tu reto, clave de los agentes con IA, respaldo y restauración.

## Dónde está cada cosa
```
src/hq/schemas.ts      modelo de datos (Zod)
src/hq/logic.ts        reglas puras: misiones, racha, niveles, tendencia, plan, agentes
src/hq/store.ts        guardado (hoy localStorage; aquí se cambia a Turso)
src/hq/agents/         Nutri (foto → calorías) y Coach (análisis), con reglas de seguridad en código
src/app/api/agents/    rutas protegidas con WSO_API_SECRET
src/components/hq/     pantallas
```

## Reglas del juego
- Día cumplido = entrenar + registrar al menos 2 comidas + no pasarte de tu meta de calorías.
- XP: día cumplido 100, clip 25, pesaje 10. Cada 300 XP subes de nivel.
- Conservador: nunca se empuja bajar más de 1 kg por semana; el piso de calorías es 1,500.

## Pruebas
```bash
npm test          # lógica, agentes (simulados), render de pantallas y motor
npm run build
```

## Pendiente
- Guardar en base de datos (Turso) para que tus datos se sincronicen entre celular y compu.
- Subir video desde la app y correr el motor en la nube; Publisher.
- Nutri y Coach todavía no se han probado con una API key real.
