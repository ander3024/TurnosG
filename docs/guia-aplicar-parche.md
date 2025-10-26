# Guía para aplicar `changes.patch` y desplegar a producción

Esta guía asume que ya clonaste el repositorio en el servidor (por ejemplo `/home/ubuntu/turnos/gestor-turnos`) y que tienes acceso a la terminal con el usuario que realiza los despliegues.

## 1. Preparar el repositorio

1. Posiciónate en la carpeta del proyecto y comprueba si hay cambios locales:
   ```bash
   cd /home/ubuntu/turnos/gestor-turnos
   git status -sb
   ```
2. Si ves una salida como la siguiente:
   ```
    M src/App.jsx
   ?? src.App.jsx
   ```
   significa que:
   - `src/App.jsx` tiene modificaciones sin guardar (probablemente restos de intentos anteriores).
   - Existe un archivo llamado `src.App.jsx` (con punto en lugar de `/`) que Git considera no rastreado.

3. Decide qué hacer con esos archivos:
   - **Si no necesitas los cambios locales** y quieres volver al estado limpio de la rama:
     ```bash
     rm -f src.App.jsx
     git checkout -- src/App.jsx
     ```
   - **Si quieres guardarlos** antes de continuar, crea una copia o un branch temporal:
     ```bash
     cp src/App.jsx src.App.jsx.backup
     git stash push -m "backup antes de aplicar parche"
     ```

4. Asegúrate de que el árbol quede limpio:
   ```bash
   git status -sb
   ```
   Deberías ver únicamente `## main...origin/main` (o la rama en la que trabajes) sin archivos modificados.

## 2. Verificar y aplicar `changes.patch`

1. Comprueba que el archivo `changes.patch` esté en la raíz del repositorio (`ls changes.patch`).
2. Haz una prueba en seco para asegurarte de que el parche aplica sin conflictos:
   ```bash
   git apply --check changes.patch
   ```
3. Si el paso anterior no devuelve errores, aplica el parche. Puedes elegir entre:
   - **Mantener el historial original del commit**:
     ```bash
     git am --signoff < changes.patch
     ```
   - **Aplicar sólo los cambios al árbol de trabajo** (harás commit después manualmente):
     ```bash
     git apply changes.patch
     ```

4. Revisa el resultado:
   ```bash
   git status -sb
   git diff
   ```
   Verifica que `src/App.jsx` (u otros archivos esperados) estén modificados conforme al parche.

5. Si usaste `git apply`, crea el commit correspondiente:
   ```bash
   git add src/App.jsx
   git commit -m "Aplicar parche admin pack"
   ```

## 3. Compilar y probar localmente

1. Instala las dependencias si aún no lo hiciste en esa máquina:
   ```bash
   npm install
   ```
2. Genera el build de producción:
   ```bash
   npm run build
   ```
   Este comando debe terminar sin errores y creará la carpeta `dist/` con los archivos listos para desplegar.
3. (Opcional) Levanta una vista previa para revisar el resultado:
   ```bash
   npm run preview -- --host
   ```
   Abre el navegador en `http://<IP>:4173` y valida que los cambios aparezcan.

## 4. Subir a producción

Los pasos dependen de tu flujo de despliegue. Dos escenarios típicos:

### 4.1. Servidor estático manual (Nginx/Apache)

1. Copia el contenido de `dist/` al directorio servido por el servidor web. Por ejemplo:
   ```bash
   rsync -av --delete dist/ /var/www/turnos/
   ```
2. Reinicia o recarga el servicio si es necesario:
   ```bash
   sudo systemctl reload nginx
   ```
3. Verifica en el navegador que la aplicación en producción muestra los nuevos cambios.

### 4.2. Pipeline CI/CD

1. Haz push de los commits a la rama correspondiente:
   ```bash
   git push origin main
   ```
2. Asegúrate de que la pipeline ejecute (al menos) los pasos de instalación y build:
   ```bash
   npm ci
   npm run build
   ```
3. Confirma en los logs del pipeline que la publicación de `dist/` se haya completado correctamente.

## 5. Solución de problemas comunes

- **`error: corrupt patch at line ...`**: suele aparecer cuando el archivo `changes.patch` está incompleto o se editó con un editor que cambió su formato. Re-descarga el archivo o vuelve a generarlo con `git format-patch`.
- **Conflictos al aplicar**: usa `git apply --reject --whitespace=fix changes.patch` para obtener archivos `.rej` y resolverlos manualmente.
- **Build fallida**: revisa el mensaje de error y asegúrate de tener la versión correcta de Node.js (consulta `package.json` para la versión recomendada) y dependencias actualizadas.

Siguiendo estos pasos tendrás un flujo reproducible para limpiar el repositorio, aplicar el parche y desplegar la nueva versión en producción.
