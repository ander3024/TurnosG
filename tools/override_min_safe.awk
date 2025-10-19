# Tras declarar 'key', añadimos shortcut de override
/const key=`.*`;/ {
  print
  print "        // --- override duro: si hay forzado, asigna y salta el resto ---"
  print "        const __forced = overrides?.[dateStr]?.[key];"
  print "        if (__forced) {"
  print "          const chosen = __forced;"
  print "          const mins = minutesDiff(shift.start, shift.end);"
  print "          weeklyMinutes.set(chosen,(weeklyMinutes.get(chosen)||0)+mins);"
  print "          hoursPerPersonMin.set(chosen,(hoursPerPersonMin.get(chosen)||0)+mins);"
  print "          if (isWE) weekendLoad.set(chosen,(weekendLoad.get(chosen)||0)+1); else weekdaysLoad.set(chosen,(weekdaysLoad.get(chosen)||0)+1);"
  print "          assigned.add(chosen);"
  print "          dayAssignments.push({shift, personId: chosen, conflict:false});"
  print "          continue;"
  print "        }"
  next
}
{ print }
