# Guía para aplicar `changes.patch` y desplegar a producción

Esta guía está pensada para el servidor donde resides el repositorio (`/home/ubuntu/turnos/gestor-turnos`). Incluye el flujo completo: limpiar el árbol, regenerar el parche cuando aparece el error `corrupt patch`, aplicarlo, compilar el build y desplegarlo.

---

## 0. Confirmar que estás en la última versión de `main`

Antes de modificar nada, asegúrate de que tu rama principal está alineada con el remoto:

```bash
git fetch origin main          # trae la referencia más reciente
git checkout main              # cambia temporalmente a la rama principal
git pull --ff-only             # avanza sin merges adicionales
```

Si trabajas desde otra rama (por ejemplo `work`), vuelve a ella cuando termines:

```bash
git checkout work
```

Verifica el commit exacto para tener constancia del hash de referencia:

```bash
git rev-parse --short HEAD
git log -1 --oneline
```

Si el entorno no tiene acceso a internet y `git fetch` falla, contrasta el hash con el que comparta el equipo antes de seguir.

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
   El resultado esperado es únicamente una línea `## <rama>...origin/<rama>` (por ejemplo `## main...origin/main`).

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
   Si aquí vuelve a fallar con `patch does not apply`, salta al apartado **3.1**. Si el error vuelve a ser `corrupt patch`, regresa a la sección 2 y regenera el archivo.

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

### 3.1. Si aparece `patch does not apply`

Este mensaje indica que tu `src/App.jsx` es distinto al del commit base del parche. Para integrarlo igualmente:

1. Asegúrate de estar sincronizado con la rama objetivo:
   ```bash
   git checkout main
   git pull --ff-only
   ```

2. Trae el commit original (si no lo hiciste antes):
   ```bash
   git fetch origin 205d536fda4fb1e998fe9303777fc9e3c36d4942
   ```

3. Cherry-pick del commit completo usando el merge de tres vías (esto reemplaza al parche):
   ```bash
   git cherry-pick --allow-empty-message --keep-redundant-commits 205d536fda4fb1e998fe9303777fc9e3c36d4942
   ```
   Si prefieres conservar la autoría exacta, puedes usar `git cherry-pick -x 205d536fda4fb1e998fe9303777fc9e3c36d4942`.

4. Si surgen conflictos (es habitual porque `src/App.jsx` evolucionó), edita el archivo indicado, resuelve las marcas `<<<<<<<`, guarda los cambios y marca el conflicto como resuelto:
   ```bash
   git status -sb          # identifica los archivos en conflicto
   # edita src/App.jsx y deja la versión correcta
   git add src/App.jsx
   git cherry-pick --continue
   ```

5. Comprueba el resultado final:
   ```bash
   git status -sb
   git log -1 --stat
   ```

Si prefieres seguir usando `changes.patch`, otra alternativa es:
```bash
git apply --3way changes.patch
```
Lo que hará Git es intentar la fusión de manera automática utilizando el contexto de la base original. Si quedan conflictos, resuélvelos igual que en el paso 4 y ejecuta `git add src/App.jsx` seguido de `git commit`.

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
