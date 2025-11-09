# Checklist rápida para detectar regresiones de UI

1. **Vista semanal (WeeklyView)**
   - Abre la aplicación con datos reales.
   - Captura la tabla completa (cmd/ctrl+shift+S) asegurándote de que se ven los badges `{asignadas}/{totales}`.
   - Verifica que las clases `text-[10px]`, `px-1.5`, `rounded` y la malla `table-auto` permanecen sin cambios.

2. **Calendario diario (admin)**
   - Inicia sesión como admin y abre el panel "Calendario diario (admin)".
   - Captura al menos un día con varios turnos asignados y uno bloqueado (`🔒`).
   - Confirma que los botones 👤 mantienen la distribución compacta (`w-[320px]`, `space-y-3`).

3. **Comparación manual**
   - Coloca las capturas “antes” y “después” lado a lado.
   - Revisa paddings (`px-2`, `py-0.5`), bordes (`rounded-xl`, `border-slate-200`) y badges (`bg-transparent`).

4. **Consejo opcional**
   - Usa una herramienta de diff visual (p. ej. `pixelmatch`) para resaltar cambios accidentales.

> Si alguno de estos elementos varía, revisa el diff antes de enviar el PR.
