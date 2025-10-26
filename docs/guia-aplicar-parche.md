# Guía para aplicar `changes.patch` y desplegar a producción

Esta guía está pensada para el servidor donde resides el repositorio (`/home/ubuntu/turnos/gestor-turnos`). Incluye el flujo completo: limpiar el árbol, regenerar el parche cuando aparece el error `corrupt patch`, aplicarlo, compilar el build y desplegarlo.

---

## 1. Preparar el repositorio

1. Posiciónate en la carpeta del proyecto y comprueba el estado:
   ```bash
   cd /home/ubuntu/turnos/gestor-turnos
   git status -sb
   ```

2. Si ves una salida como:
   ```
    M src/App.jsx
   ?? src.App.jsx
   ```
   significa que:
   - `src/App.jsx` tiene restos de intentos anteriores.
   - Existe un archivo suelto `src.App.jsx` (con punto) que no debería estar ahí.

   Para dejar el árbol limpio ejecuta:
   ```bash
   rm -f src.App.jsx           # elimina el archivo huérfano
   git checkout -- src/App.jsx # descarta cambios en el archivo real
   git status -sb              # verifica que quedó limpio
   ```
   El resultado esperado es únicamente `## main...origin/main` sin más líneas.

3. Si necesitas conservar cambios locales antes de limpiarlos, cópialos aparte:
   ```bash
   cp src/App.jsx src.App.jsx.backup
   ```
   *(En este punto `git stash` no guardará nada porque el árbol ya está limpio.)*

---

## 2. Regenerar el parche cuando aparece `corrupt patch`

El mensaje `error: corrupt patch at line 79` indica que `changes.patch` está incompleto (se cortó al transferirlo). Para volver a tener una copia válida:

1. Asegúrate de tener el commit original en tu repositorio local:
   ```bash
   git fetch origin 205d536fda4fb1e998fe9303777fc9e3c36d4942
   ```

2. Genera de nuevo el parche a partir de ese commit:
   ```bash
   git format-patch -1 205d536fda4fb1e998fe9303777fc9e3c36d4942 --stdout > changes.patch
   ```
   Comprueba que el archivo existe y tiene tamaño:
   ```bash
   ls -lh changes.patch
   head -n 5 changes.patch   # debe empezar por "From 205d53..."
   ```

3. Opcionalmente, guarda el checksum para validar que no se vuelva a corromper al copiarlo:
   ```bash
   sha256sum changes.patch
   ```

---

## 3. Aplicar el parche

1. Prueba en seco:
   ```bash
   git apply --check changes.patch
   ```
   Si aquí vuelve a fallar, revisa que tu árbol esté limpio (paso 1) y que el parche se generó en el paso anterior.

2. Aplica el parche. Tienes dos opciones:
   - Mantener autor y mensaje original del commit:
     ```bash
     git am --signoff < changes.patch
     ```
   - Aplicar sólo el diff y commitear después manualmente:
     ```bash
     git apply changes.patch
     git add src/App.jsx
     git commit -m "UI(admin): aplicar pack2"
     ```

3. Verifica el resultado:
   ```bash
   git status -sb
   git diff HEAD^ HEAD        # revisa los cambios si usaste git am
   ```

---

## 4. Compilar y revisar el build

1. Instala dependencias (si aún no lo hiciste en esa máquina):
   ```bash
   npm install
   ```

2. Genera el build de producción:
   ```bash
   npm run build
   ```
   El comando crea `dist/` si todo salió bien.

3. (Opcional) Revisa el resultado con el servidor de previsualización:
   ```bash
   npm run preview -- --host
   ```
   Abre `http://<IP-del-servidor>:4173` y valida que los cambios aparezcan.

---

## 5. Subir a producción

Dependiendo de tu flujo:

### 5.1. Servidor estático (Nginx/Apache)

1. Copia el contenido de `dist/` a la carpeta servida por tu web server:
   ```bash
   rsync -av --delete dist/ /var/www/turnos/
   ```

2. Recarga el servicio si hace falta:
   ```bash
   sudo systemctl reload nginx
   ```

3. Verifica en el navegador público que los cambios estén visibles.

### 5.2. Pipeline CI/CD

1. Empuja la rama con el commit del parche:
   ```bash
   git push origin main
   ```

2. Asegúrate de que la pipeline ejecute:
   ```bash
   npm ci
   npm run build
   ```
   y publique `dist/`.

3. Comprueba los logs del despliegue y prueba la URL final.

---

## 6. Resumen de errores frecuentes

- **`error: corrupt patch at line ...`**: el archivo `changes.patch` se cortó. Vuelve a generarlo con `git format-patch` como se describe en la sección 2.
- **`patch does not apply`**: tu árbol tiene cambios locales o estás en un commit distinto. Ejecuta `git status -sb` para confirmar que está limpio y vuelve a intentarlo. Si aún falla, sincroniza con `git pull --ff-only` antes de aplicar el parche.
- **Fallos de build (`npm run build`)**: revisa el mensaje de error y confirma que utilizas la versión de Node recomendada en `package.json`.

Siguiendo estos pasos deberías poder recuperar el parche, aplicarlo sin errores y desplegar los cambios en producción.
