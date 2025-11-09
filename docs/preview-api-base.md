# Configurar VITE_API_BASE para entornos de preview

Cuando se levanta la SPA con `npm run dev` o `npm run preview`, el frontend se sirve desde `http://127.0.0.1:5173` y las peticiones `fetch("/api/...")` se resolverán contra el propio puerto 5173. Para apuntarlas a un backend distinto (por ejemplo, `http://127.0.0.1:8080`), define la variable `VITE_API_BASE`.

## Pasos
1. Crea un archivo `.env.development` (o edita el existente) en la raíz del proyecto con el siguiente contenido:
   ```ini
   VITE_API_BASE=http://127.0.0.1:8080
   ```
2. Reinicia el servidor de desarrollo/preview (`npm run dev` o `npm run preview`).
3. A partir de ese momento, el helper `api()` utilizará `http://127.0.0.1:8080/api/...` para las peticiones y dejarás de ver errores 404 al intentar autenticarse desde el puerto 5173.

> **Tip:** si necesitas apuntar a otra URL temporal, cambia el valor y reinicia el comando de preview. No es necesario hacer build completo.
