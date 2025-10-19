BEGIN { done=0 }
{
  print
  # Inserta justo después del DIV que contiene el label+input de "Semanas a mostrar"
  if (!done && $0 ~ /Semanas a mostrar<\/label><input/) {
    print "        <div className=\"col-span-2\">"
    print "          <button"
    print "            type=\"button\""
    print "            className=\"px-3 py-2 rounded-lg border\""
    print "            title=\"Calcular semanas hasta el 31/12\""
    print "            onClick={() => { const s = parseDateValue(state.startDate); const end = new Date(s.getFullYear(), 11, 31); const days = Math.max(1, Math.floor((end - s)/(24*3600*1000)) + 1); const w = Math.ceil(days/7); up(['weeks'], w); }}"
    print "          >Hasta fin de año</button>"
    print "        </div>"
    done=1
  }
}
