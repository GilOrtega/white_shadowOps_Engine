# WhiteShadow — Centro de mando

La app (Next.js 16) que vive encima del motor de shorts (`ENGINE.md`).

## Interfaz (estilo macOS / iOS)
- Escritorio: barra lateral · lienzo central · **inspector** a la derecha (chat con Sombra, "Rapo a la 0" y estado de agentes; se oculta con el botón de la barra de herramientas).
- Celular: barra de pestañas translúcida y **Sombra como HUD flotante** (abre una hoja con el chat). Su halo cambia según el estado: listo, en fuego, celebrando, preocupado o pensando (cuando el Crew trabaja).
- Materiales `glass` / `glass-bar` (blur + saturación + borde de 1 px) sobre un fondo de orbes; claro y oscuro siguen al sistema; todo respeta "reducir movimiento".

## Pantallas
- `/` Hoy: resumen, **Rapo a la 0** (días al veredicto + barra de peligro del día verde→rojo según la hora), **Daily Fuel** (anillo de calorías, proteína y si el día ya quedó asegurado), plan de ataque del día, preguntas de los agentes, comidas, entrenamiento y equipo de agentes.
- `/crew` **Estudio de shorts (Stream Crew)**:
  1. Arrastras el `transcript.json` que deja `npm run pipeline` (o pruebas la demo, sin gastar API).
  2. **Agente 0 · Briefing**: 3 preguntas (momento más fuerte, tono, cuántos clips y duración) antes de lanzar.
  3. **Pipeline en vivo**: cada agente con su barra, tokens y logs. El Miner transmite su avance por SSE (`/api/engine/mine/stream`).
  4. **Corte de montaje (revisión humana)**: cuadro 9:16 con la interfaz simulada de TikTok / Reels / Shorts, gancho de 3 s editable, subtítulos que arrastras a la altura correcta, copy y hashtags editables, aprobar/descartar. Puedes ver el clip con tu video local (no se sube).
  5. Exportas el **plan de render** y corres `npm run render:plan -- <video> <transcript.json> <plan.json> --layout split` en tu compu.
  - **Agente 6 · Plan de ataque** lee tu reto de hoy (racha, día caído, kilos, días al veredicto) y propone el ángulo y el tono del contenido.
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
src/components/hq/     pantallas (Shell = layout macOS/iOS, Widgets = anillos, Rapo a la 0, Daily Fuel)
src/hq/ui-prefs.ts     preferencias de interfaz (inspector) y actividad de la mascota
src/crew/schemas.ts    StreamJob, Brief, ReviewClip (Zod)
src/crew/logic.ts      reglas puras: etapas, briefing → Miner, Plan de ataque, plan de render
src/crew/repo.ts       JobRepository (hoy IndexedDB; aquí se cambia a base de datos)
src/crew/runner.ts     orquestador en el navegador: Miner (SSE) → Editor/Auto-Hook → Copywriter
src/crew/copywriter.ts Agente 4 (título, descripción, hashtags)
src/app/api/engine/mine/stream/  Miner con avance en vivo
src/app/api/agents/copy/         Copywriter
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
- Publisher: subir a TikTok / Reels / Shorts con sus APIs (hoy: plan de render + textos para pegar).
- Correr el render (FFmpeg) en Cloud Run en vez de tu compu; el video nunca pasa por Vercel.
- Guardar en base de datos (Turso) para que tus datos se sincronicen entre celular y compu.
- Subir video desde la app y correr el motor en la nube; Publisher.
- Nutri y Coach todavía no se han probado con una API key real.
