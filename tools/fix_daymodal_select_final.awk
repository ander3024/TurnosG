BEGIN { inM=0; brace=0; fixing=0 }
/^function DayModal\(/ { inM=1; brace=0 }
{
  if (inM) { brace += gsub(/\{/,"{"); brace -= gsub(/\}/,"}"); }

  # cuando encontremos la apertura del <select> del turno, imprimimos bloque limpio y saltamos lo roto hasta el primer '>'
  if (inM && fixing==0 && $0 ~ /^\s*<select/ ) {
    print "                    <select"
    print "                      className=\"border rounded px-2 py-1 text-sm\""
    print "                      value={c.personId || ''}"
    print "                      onChange={e=> (isAdmin && onOverride(dateStr, i, e.target.value || null))}"
    print "                      disabled={!isAdmin}"
    print "                    >"
    fixing = 1
    next
  }

  # si estamos saltando el bloque roto, dejamos de saltar al encontrar la primera línea con '>'
  if (fixing==1) {
    if (index($0, ">")>0) { fixing=0 }   # descartamos la primera '>' vieja
    next
  }

  print

  if (inM && brace<=0) inM=0
}
