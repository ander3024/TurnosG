# Checklist rápida de regresión visual

Esta guía sirve para validar que un PR no modifica el aspecto del calendario semanal ni del calendario diario.

## Antes del cambio
1. Ejecuta `npm run build` para asegurarte de que el bundle compila.
2. Lanza `npm run dev` y abre la aplicación en `http://localhost:5173`.
3. Haz capturas de:
   - Vista semanal (`Card` "Vista semanal por persona") con una semana visible.
   - Calendario diario (panel "Calendario diario (admin)") mostrando al menos dos tarjetas con menú 👤.

Guarda las capturas con el sufijo `before` (por ejemplo `weekly-before.png`, `calendar-before.png`).

## Después del cambio
1. Aplica los cambios del PR y vuelve a ejecutar `npm run build`.
2. Repite las capturas anteriores (`weekly-after.png`, `calendar-after.png`).
3. Compara visualmente ambos pares de imágenes; si hay diferencias, revisa que formen parte del alcance aprobado del PR.

## Notas
- No es necesario automatizar las capturas, pero si usas Playwright u otra herramienta, documenta el comando en el PR.
- Si la UI cambia por requisitos explícitos, adjunta las capturas "before/after" en la descripción del PR para facilitar la revisión.
