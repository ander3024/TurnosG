# Inserta weekRangeLabel tras la línea que define weeklyStart
/const weeklyStart=useMemo\(\)=> addDays\(startDate, weekIndex\*7\), \[startDate, weekIndex\]\);/ {
  print
  print "  // Rango visible de la semana (ej. '27 oct 2025 – 02 nov 2025')"
  print "  const weekRangeLabel = (() => {"
  print "    const s = weeklyStart;"
  print "    const e = addDays(weeklyStart, 6);"
  print "    const fmt = d => d.toLocaleDateString(undefined,{ day:'2-digit', month:'short', year:'numeric' });"
  print "    return `${fmt(s)} – ${fmt(e)}`;"
  print "  })();"
  next
}
# Reemplaza el texto del título "Semana X / Y" para añadir el rango
/\<div className="text-sm">Semana \{weekIndex\+1\} \/ \{state\.weeks\}<\/div\>/ {
  print "              <div className=\"text-sm\">Semana {weekIndex+1} / {state.weeks} · {weekRangeLabel}</div>"
  next
}
{ print }
