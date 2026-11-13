---
name: motion
description: Diseña y revisa motion graphics en Remotion a partir de un guion, con causalidad, jerarquía visual y animación determinista por frame. Úsala al animar o corregir movimiento, una vez clara la historia.
---

# Motion que explica

Lee el brief, la voz y las restricciones del proyecto. Antes de programar, define qué debe entenderse, la frase o acción que causa el movimiento y el cuadro de entrada y salida. Si la historia no está clara, resuelve ese punto antes de añadir efectos.

## Contrato breve por escena

Anota en el brief: idea, objeto protagonista, causa de cada transición, énfasis, tiempos, estado de entrada/salida y eventos sonoros. Usa los tiempos reales de voz cuando existan; no inventes sincronía exacta a partir del texto.

- Un protagonista por momento; los secundarios acompañan sin competir. Deja tiempo para entender el resultado de cada acción.
- El movimiento debe revelar una relación: causa, consecuencia, contraste, acumulación o cambio de escala. Un corte directo puede resolver una transición.
- Reserva el mayor énfasis para los descubrimientos importantes. No hagas un impacto por palabra; número de golpes y tiempo de quietud dependen de la pieza.
- Compón textos y objetos sin solapes. Usa márgenes de la plataforma si están verificados; no llames oficial a una guía de terceros. Revisa a tamaño de móvil.
- Usa anticipación, peso y asentamiento cuando ayuden a entender la acción. No mantengas rebotes, cámara o partículas después de que cumplieron su función.
- Si una captura explica mejor un paso, úsala. No rehagas una pieza aprobada cuando un export existente resuelve el mismo contenido.

## Remotion

Lee primero la estructura existente y sus comandos de proyecto. Calcula animación desde `useCurrentFrame()` y fps; usa `interpolate` o `spring` con extrapolación y duración controladas. Dentro de `Sequence`, el frame es local: convierte los tiempos globales cuando corresponda. Evita reloj de pared, `Math.random()` sin semilla y efectos CSS que avancen independientemente del render.

Recursos locales referenciados con `staticFile()`. Registra procedencia y licencias. Si adoptas una técnica de referencia, describe qué adaptaste; no atribuyas la calidad o viralidad a una herramienta por sí sola.

## Revisar

Revisa inicio, momento explicativo y final de cada escena y reproduce el tramo completo: las imágenes quietas no prueban legibilidad temporal. Comprueba continuidad, subtítulos y una sola pista de voz. Ejecuta los chequeos definidos por el proyecto. Renderiza cuando se solicite; mide audio y revisa el archivo final, no solo la vista previa. Informa qué viste, qué escuchaste y qué queda pendiente.
