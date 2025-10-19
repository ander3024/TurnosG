# Activa in_modal cuando entra en DayModal, desactiva al salir del cuerpo del componente.
# Añade disabled={!isAdmin} a <select ...> si estamos dentro del DayModal.
BEGIN{ in_modal=0; brace=0 }
/^function DayModal\(/ { in_modal=1; brace=0; print; next }
in_modal==1 {
  # controla apertura/cierre de llaves del DayModal
  brace += gsub(/\{/, "{")
  brace -= gsub(/\}/, "}")
  # si encontramos un <select ...> sin disabled, lo añadimos antes del '>'
  if ($0 ~ /<select[^>]*>/ && $0 !~ /disabled={!isAdmin}/) {
    sub(/<select([^>]*)>/, "<select\\1 disabled={!isAdmin}>")
    print
    if (brace<=0) in_modal=0
    next
  }
  print
  if (brace<=0) in_modal=0
  next
}
{ print }
