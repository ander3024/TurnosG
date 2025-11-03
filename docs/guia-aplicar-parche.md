# Guía para aplicar `changes.patch` y desplegar a producción

Esta guía está pensada para el servidor donde resides el repositorio (`/home/ubuntu/turnos/gestor-turnos`). Incluye el flujo completo: limpiar el árbol, regenerar el parche cuando aparece el error `corrupt patch`, aplicarlo, compilar el build y desplegarlo.

---

## Resumen rápido (caso habitual)

Si tu árbol está limpio y sólo quieres aplicar `changes.patch` en el servidor donde resides (`root@ubuntu:/home/ubuntu/turnos/gestor-turnos#`), sigue esta secuencia básica:

```bash
cd /home/ubuntu/turnos/gestor-turnos
git status -sb                    # debe mostrar solo "## main...origin/main"
git fetch origin 205d536fda4fb1e998fe9303777fc9e3c36d4942
git format-patch -1 205d536fda4fb1e998fe9303777fc9e3c36d4942 --stdout > changes.patch
git apply --check changes.patch   # verifica que encaje
git apply changes.patch           # aplica el diff
git add src/App.jsx
git commit -m "Aplicar parche admin pack2"
npm install                        # solo si faltan dependencias
npm run build
```

> **Importante:** si `git apply --check changes.patch` falla con `patch does not apply`, salta directamente a la sección ["Cuando el parche no encaja"](#cuando-el-parche-no-encaja). No repitas `git apply` en bucle, porque no funcionará mientras el archivo local sea distinto.

Después de compilar, despliega el contenido de `dist/` según tu flujo (ver sección 5). Si cualquiera de los pasos falla, consulta las secciones detalladas más abajo.

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

### 3.1. Cuando el parche no encaja

`patch does not apply` significa que el parche está bien formado pero tu `src/App.jsx` ya no coincide con el contexto del commit `205d536`. En esta situación **debes fusionar el cambio con la versión actual**. Tienes dos rutas seguras:

#### Opción A · `git apply --3way`

```bash
git apply --3way changes.patch
```

Git intentará adaptar el diff automáticamente a tu versión actual. Si aún así quedan conflictos (`CONFLICT`), edita `src/App.jsx`, elimina los marcadores `<<<<<<<`/`=======`/`>>>>>>>`, deja el contenido correcto y termina con:

```bash
git add src/App.jsx
git commit -m "Resuelve conflictos al aplicar changes.patch"
```

#### Opción B · `git cherry-pick`

1. Sitúate en la rama donde quieres el cambio (por ejemplo `main`) y asegúrate de tener lo último:
   ```bash
   git checkout main
   git pull --ff-only
   ```

2. Descarga el commit original si no lo tenías:
   ```bash
   git fetch origin 205d536fda4fb1e998fe9303777fc9e3c36d4942
   ```

3. Reaplica el commit completo con fusión de tres vías (añade `-x` si quieres que el mensaje cite el hash original):
   ```bash
   git cherry-pick --strategy-option theirs --allow-empty-message 205d536fda4fb1e998fe9303777fc9e3c36d4942
   ```

4. Si Git muestra conflictos, resuélvelos:
   ```bash
   git status -sb          # identifica los archivos en conflicto
   # edita src/App.jsx y deja la versión deseada
   git add src/App.jsx
   git cherry-pick --continue
   ```

5. Revisa el resultado y continúa con la compilación:
   ```bash
   git status -sb
   git log -1 --stat
   ```

Ambos métodos dejan el cambio aplicado sobre tu rama actual listo para compilar y desplegar.

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
