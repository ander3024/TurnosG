# Preview local con backend externo

Para que `npm run preview` apunte a un backend distinto al proxy `/api` del servidor de producción, crea un fichero `.env.development` en la raíz del proyecto con el valor de la API:

```env
VITE_API_BASE=http://127.0.0.1:8080
```

Al iniciar `npm run dev` o `npm run preview`, todas las peticiones que usen el helper `api("/ruta")` se resolverán contra `http://127.0.0.1:8080/ruta`. Si la variable no está definida, el comportamiento por defecto (`/api/...`) se mantiene.
