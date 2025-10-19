/\{\/* Controles Nube \*\/\}/{
  print "            {/* Controles Nube */}"
  print "            {isAdmin ? ("
  print "              <div className=\"flex items-center gap-2\">"
  print "                <input className=\"border rounded px-2 py-1 w-32\" placeholder=\"Space ID\""
  print "                  value={cloud.spaceId} onChange={e=>setCloud({...cloud,spaceId:e.target.value})}/>"
  print "                <input className=\"border rounded px-2 py-1 w-28\" placeholder=\"ReadToken\""
  print "                  value={cloud.readToken} onChange={e=>setCloud({...cloud,readToken:e.target.value})}/>"
  print "                <input className=\"border rounded px-2 py-1 w-28\" placeholder=\"WriteToken\""
  print "                  value={cloud.writeToken} onChange={e=>setCloud({...cloud,writeToken:e.target.value})}/>"
  print "                <button onClick={cloudLoad} className=\"px-3 py-1.5 rounded-lg border\">Cargar nube</button>"
  print "                <button onClick={cloudSave} className=\"px-3 py-1.5 rounded-lg border\">Guardar nube</button>"
  print "              </div>"
  print "            ) : ("
  print "              <div className=\"flex items-center gap-2\">"
  print "                <input className=\"border rounded px-2 py-1 w-32\" placeholder=\"Space ID\""
  print "                  value={cloud.spaceId} onChange={e=>setCloud({...cloud,spaceId:e.target.value})}/>"
  print "                <input className=\"border rounded px-2 py-1 w-28\" placeholder=\"ReadToken\""
  print "                  value={cloud.readToken} onChange={e=>setCloud({...cloud,readToken:e.target.value})}/>"
  print "                <button onClick={cloudLoad} className=\"px-3 py-1.5 rounded-lg border\">Cargar nube</button>"
  print "              </div>"
  print "            )}"
  skip=1; next
}
skip==1 && /onClick=\{\s*doLogout\s*\}/ { skip=0; print; next }
skip==1 { next }
{ print }
