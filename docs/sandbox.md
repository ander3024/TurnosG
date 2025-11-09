# Sandbox de cuadrantes y optimizador

## Objetivo
El sandbox permite generar capas alternativas del cuadrante actual, ejecutar optimizaciones en segundo plano y comparar los resultados con el plan "real" antes de aplicar cambios masivos.

## Componentes principales
- **Capas sandbox (`state.sandbox.layers`)**: copias del cuadrante actual con sus asignaciones, métricas y fecha de última optimización.
- **Snapshots (`state.sandbox.snapshots`)**: checkpoints inmutables de cada capa, utilizables para restaurar rápidamente un estado anterior.
- **Batches aplicados (`state.sandbox.appliedBatches`)**: registro de overrides creados al aplicar una capa sobre el cuadrante oficial, con soporte de rollback.
- **Objetivos**: ponderaciones persistentes para el optimizador (`fairness`, `conciliacion`, `priority`, `minChanges`).

## Flujo habitual
1. **Crear capa** desde el cuadrante actual mediante “Crear desde cuadrante real”.
2. **Optimizar** con el botón correspondiente; el cálculo se ejecuta en un WebWorker (`src/workers/optimizer.js`) para no bloquear la UI.
3. **Comparar** resultados en la tarjeta “Comparador sandbox” (dif por persona y por fecha).
4. (Opcional) **Guardar snapshot** antes de aplicar.
5. **Aplicar capa** para generar overrides en bloque. Se crea un batch con historial para permitir rollback.
6. **Rollback** desde la sección “Batches aplicados” si es necesario.

## Exportación
Cada capa puede exportarse en JSON o CSV (para auditoría o análisis externo). Los snapshots utilizan el mismo formato.

## Persistencia y sincronización
- Todo el sandbox se guarda en `localStorage` junto con el resto del estado (`STORAGE_KEY`).
- `cloudSave`/`cloudLoad` incluyen la estructura `sandbox`, permitiendo subir/recuperar las capas en remoto.

## Worker de optimización
El archivo `src/workers/optimizer.js` implementa un heurístico simple:
- Respeta restricciones duras (TOs/festivos, máximo de días y horas semanales, fines de semana consecutivos).
- Ajusta cargas redistribuyendo turnos desde las personas con más minutos hacia las que tienen menos, sin romper reglas.
- Devuelve las asignaciones optimizadas y métricas por persona (minutos totales, fines de semana, etc.).

Los mensajes `postMessage` manejan payloads `{ type:'run', payload:{...} }` y devuelven `{ type:'result', result:{ assignments, metrics, changes } }`.

## Aplicar y revertir
- `applySandboxLayer` genera overrides por diferencia de turnos y registra el batch en `state.sandbox.appliedBatches`.
- `rollbackSandboxBatch` restaura los overrides anteriores usando el historial capturado.

## UI
Las tarjetas “Sandbox”, “Objetivos de optimización” y “Comparador sandbox” sólo se muestran a administradores y mantienen intacto el look & feel de la vista principal.

