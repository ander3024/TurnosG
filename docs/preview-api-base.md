# Preview local con backend externo

# Configurar VITE_API_BASE en desarrollo

Para que `npm run preview` apunte a un backend distinto al proxy `/api`, crea un `.env.development` con:

```env
VITE_API_BASE=http://127.0.0.1:8080
```

Reinicia el servidor. El helper `api()` añadirá la base automáticamente; si la variable falta, seguirá utilizando `/api/...`.
