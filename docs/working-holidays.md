# Guardias en festivo (working holidays)

## ¿Qué hace esta funcionalidad?

Permite marcar determinados festivos como "trabajados" para que el generador
cree automáticamente un turno de 12 horas (igual que un fin de semana) aunque
la empresa esté oficialmente cerrada.

## Dónde configurarlo

1. Abre la aplicación con un usuario administrador.
2. En el panel lateral de configuración, desplázate hasta la tarjeta **"Guardias
   en festivo (12h como finde)"**.
3. Usa el selector de fecha para añadir nuevos días. Cada fecha se guarda en el
   estado (`state.workingHolidays`) y queda visible en la lista inferior.
4. Pulsa **"Eliminar"** junto a una fecha para retirarla.

## Cómo funciona en la generación del cuadrante

* Los días añadidos pasan a la lista `workingHolidays` y se sincronizan con la
  nube cuando se ejecuta `cloudSave`.
* Durante `generateSchedule`, si el día coincide con un festivo/cierre pero
  también está en `workingHolidays`, se genera un turno de 12 h como si fuera un
  fin de semana, garantizando cobertura.
* La vista semanal y el calendario muestran estos días con el turno extra
  habitual, por lo que puedes asignarlo, moverlo o bloquearlo igual que cualquier
  otro refuerzo.

## Consejos

* Añade las fechas a principio de temporada para que todos los cálculos de
  horas (controles, conciliación, nóminas) las tengan en cuenta desde el inicio.
* Si subes/descargas el estado desde la nube, asegúrate de que `state.offPolicy`
  y `state.workingHolidays` estén actualizados antes de generar el cuadrante.
