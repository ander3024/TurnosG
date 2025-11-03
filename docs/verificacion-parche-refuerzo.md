# Verificación de estabilidad tras aplicar cambios de refuerzos

Para asegurar que los cambios relacionados con los eventos de refuerzo no rompen funcionalidades existentes, sigue estas comprobaciones tras aplicar el parche en `src/App.jsx`:

1. **Reconstrucción del proyecto**
   - Ejecuta `npm run build` y verifica que la compilación se complete sin errores ni warnings nuevos relevantes.
   - Comprueba que la carpeta `dist/` se regenere correctamente.

2. **Smoke test en entorno local**
   - Lanza `npm run preview` y accede a `http://127.0.0.1:4173`.
   - Inicia sesión con un usuario **admin** y confirma que puedes:
     - Crear o editar un evento de refuerzo.
     - Reasignar las personas asociadas desde el editor y que los cambios se reflejen en el cuadrante.
   - Accede con un usuario **no admin** para validar que los formularios sensibles continúan bloqueados.

3. **Validación de planificación**
   - Genera un cuadrante completo para al menos dos semanas.
   - Confirma que los refuerzos forzados se asignan a la persona seleccionada y que el resto de turnos se reparten como antes (revisa totales semanales y fines de semana consecutivos).
   - Abre el `WeekendAuditPanel` y verifica que las estadísticas sigan calculándose con normalidad.

4. **Sincronización con la nube (si aplica)**
   - Guarda el estado en la nube desde un usuario admin.
   - Vuelve a cargarlo y comprueba que las reasignaciones de refuerzo se mantienen.

5. **Revisión rápida de consola del navegador**
   - Durante el smoke test, abre las DevTools y confirma que no aparecen errores JavaScript nuevos.

Si cualquiera de estos pasos falla, restaura la copia de seguridad de `src/App.jsx` y abre una incidencia con los detalles del fallo observado.
