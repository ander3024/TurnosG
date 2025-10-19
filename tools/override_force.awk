# Inserta forced/isForced justo tras la línea del key
/const key=\`\$\{shift\.start\}-\$\{shift\.end\}-\$\{shift\.label\|\|\`T\$\{s\+1\}\`\}\`;/ {
  print
  print "        const forced = overrides?.[dateStr]?.[key];"
  print "        const isForced = !!forced;"
  next
}

# Reescribe el bloque de candidatos básicos:
# de: let pool=working.filter(!assigned).filter(!timeOff)
# a:  let pool=working.filter(!timeOff); if(!isForced) pool=pool.filter(!assigned);
#     si es override, garantizamos incluir forzado
/let pool=working/ {
  gsub(/let pool=working[^;]*;/,
       "let pool = working\n          .filter(p=> !(timeOffIndex.get(p.id)?.has(dateStr)));\n        if(!isForced){ pool = pool.filter(p=> !assigned.has(p.id)); }\n        if(isForced){ const f = working.find(p=> p.id===forced); if(f && !pool.some(x=>x.id===f.id)) pool = [f, ...pool]; }");
  print; next
}

# Envuelve el filtro de reglas duras con if(!isForced)
/pool = pool\.filter\(p => respectsRules\(/ {
  print "        if(!isForced) " $0
  next
}

# Cambia elección: si isForced, elegido = forced
/let chosen=null; const forced=overrides/ {
  print "        let chosen=null;"; next
}
/^        if\(forced && pool\.some\(p=>p\.id===forced\)\) chosen=forced;/ {
  print "        if(isForced){ chosen = forced; }"
  next
}
