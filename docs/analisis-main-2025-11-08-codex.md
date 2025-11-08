# Revisión de `main` (commit 19dafc3, 2025-11-08)

## Resumen ejecutivo
- Se restauró la maqueta compacta del calendario manteniendo el nuevo editor inline para administradores y la lógica de bloqueos/traslados.
- La vista semanal vuelve al layout previo (badges, paddings) con soporte para huecos bloqueados y la misma semántica de conciliación.
- Se añadió un panel exclusivo para administradores que consulta el endpoint `/audit/ips` y refresca periódicamente la lista de IPs activas.

## Calendario diario (admin)
- El componente `CalendarView` vuelve a usar tarjetas compactas por día, con encabezado día/fecha y tarjetas por turno. El editor inline permite elegir turno (mañana/tarde/refuerzo), reasignar o vaciar huecos y marcar bloqueos forzados; sólo se muestra para `isAdmin`.
- La acción `handleCalendarCommand` sigue aplicando overrides mediante `forceAssign`, incluyendo los modos `assign`, `move` y `clear` con soporte para `__EMPTY__`.

## Vista semanal y componentes asociados
- `WeeklyView` recupera el grid original de celdas con badges para vacaciones, libranzas y festivos, diferenciando huecos vacíos, bloqueados y ocupados.
- `PrettyAssignment` mantiene los chips compactos por persona y los iconos contextuales (☀️/🌙/➕/🗓️) respetando la estética previa.

## Auditoría de IPs activas
- `AuthenticatedApp` gestiona un estado `ipAudit` que se llena mediante `api('/audit/ips')` si el usuario es administrador. El panel se refresca cada minuto y se oculta automáticamente para roles sin privilegios.

## Verificaciones realizadas
- `npm run build`

## Recomendaciones
- Añadir pruebas automatizadas para `handleCalendarCommand` y para la normalización de celdas (`normalizeAssignmentsCell`) reduciría regresiones cuando se importen datos antiguos.
- Considerar cachear la última respuesta de `/audit/ips` para mostrar datos incluso si la llamada posterior falla.

## Seguimiento
- Confirmado rebase sobre `v2025.11.08` antes de preparar el PR.
