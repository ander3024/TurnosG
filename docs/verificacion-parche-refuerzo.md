# Verificación de estabilidad tras aplicar cambios de refuerzos

Para asegurar que los cambios relacionados con los eventos de refuerzo no rompen funcionalidades existentes, sigue estas comprobaciones tras aplicar el parche en `src/App.jsx`:

1. **Reconstrucción del proyecto**
   - Ejecuta `npm run build` y verifica que la compilación se complete sin errores ni warnings nuevos relevantes.
   - Comprueba que la carpeta `dist/` se regenere correctamente.

2. **Smoke test en entorno local**
   - Lanza `npm run preview` y accede a `http://127.0.0.1:4173`.
   - Inicia sesión con un usuario **admin** y valida, en este orden:
     - En el panel "Calendario diario (admin)", abre un día vacío y comprueba que el formulario lista los turnos (mañana/tarde) y todas las personas.
     - Guarda una asignación y asegúrate de que el cuadrante semanal se actualiza inmediatamente.
     - Abre un hueco ya asignado, cambia el turno (por ejemplo de mañana a tarde) y verifica que el checkbox "Vaciar turno original" evita duplicidades.
     - Usa la opción de desasignar para volver a dejar el hueco vacío y confirma que se muestra el chip de bloqueo.
     - Repite la operación anterior y revisa la consola del navegador para detectar errores de React.
   - Desde la misma sesión admin, crea o edita un evento de refuerzo y reasigna la persona seleccionada; revisa que el cuadrante refleja al nuevo titular.
   - Cierra sesión, entra con un usuario **no admin** y comprueba que el calendario queda en modo solo lectura (no aparece el formulario al pulsar en los días).

3. **Validación de planificación**
   - Genera un cuadrante completo para al menos dos semanas.
   - Confirma que los refuerzos forzados se asignan a la persona seleccionada y que el resto de turnos se reparten como antes (revisa totales semanales y fines de semana consecutivos).
   - Abre el `WeekendAuditPanel` y verifica que las estadísticas sigan calculándose con normalidad.

4. **Sincronización con la nube (si aplica)**
   - Guarda el estado en la nube desde un usuario admin.
   - Vuelve a cargarlo y comprueba que las reasignaciones de refuerzo se mantienen.

5. **Revisión rápida de consola y refresco forzado**
   - Durante el smoke test, abre las DevTools y confirma que no aparecen errores JavaScript nuevos.
   - Realiza un `hard refresh` (`Ctrl+F5`) con el usuario admin y repite una asignación rápida; sirve para detectar bundles mal fusionados tras resolver conflictos.

Si cualquiera de estos pasos falla, restaura la copia de seguridad de `src/App.jsx` y abre una incidencia con los detalles del fallo observado.
