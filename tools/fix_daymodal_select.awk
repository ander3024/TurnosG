BEGIN { inModal=0; brace=0; skipSel=0 }
/^function DayModal\(/ { inModal=1; brace=0 }
{
  if (inModal) { brace += gsub(/\{/,"{"); brace -= gsub(/\}/,"}"); }
  if (inModal && skipSel==0 && $0 ~ /^\s*<select\s*$/) {
    # Sustituimos TODO el bloque de apertura del select por una versión limpia
    print "                    <select"
    print "                      className=\"border rounded px-2 py-1 text-sm\""
    print "                      value={c.personId || ''}"
    print "                      onChange={e=> (isAdmin && onOverride(dateStr, i, e.target.value || null))}"
    print "                      disabled={!isAdmin}"
    print "                    >"
    skipSel=1
    next
  }
  if (skipSel==1) {
    # saltar líneas antiguas del bloque de apertura hasta la primera que contenga '>'
    if (index($0, ">")>0) { skipSel=0 }  # al encontrar '>' dejamos de saltar
    next
  }
  print
  if (inModal && brace<=0) { inModal=0 }
}
