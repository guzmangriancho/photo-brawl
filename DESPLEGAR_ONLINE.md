# PHOTO BRAWL — Despliegue de prueba (Vercel + Render)

## 0. Proyecto
Usa esta carpeta completa (parche de la V11). El frontend es Vite y el backend WebSocket se encuentra en `server/index.cjs`. No uses `npm run dev:online` en Render: es un lanzador de desarrollo.

## 1. Subir a GitHub
Crea un repositorio privado en https://github.com/new, por ejemplo `photo-brawl`. En la carpeta extraída ejecuta en CMD (con Git instalado):

```cmd
git init
git add .
git commit -m "PHOTO BRAWL online deployment"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/photo-brawl.git
git push -u origin main
```

Si ya tienes un repositorio, sube los cambios a ese repositorio. No subas `.env.local` ni claves de Gemini; las variables `VITE_` son públicas en el navegador.

## 2. Crear el servidor en Render
1. En https://dashboard.render.com pulsa **New → Web Service** y selecciona el repositorio.
2. Configura:
   - Name: `photo-brawl-online` (u otro nombre libre).
   - Language/Runtime: `Node`.
   - Branch: `main`.
   - Root Directory: deja vacío (raíz del repositorio).
   - Build Command: `npm install && npm run build:server-engine` (el ZIP no incluye `package-lock.json`).
   - Start Command: `node server/index.cjs`.
   - Instance: Free (solo pruebas, puede hibernar).
   - Health Check Path (si aparece): `/health`.
3. En Environment, define `ONLINE_ALLOWED_ORIGINS` una vez conozcas la URL de Vercel. Por ejemplo: `https://photo-brawl.vercel.app` (sin barra final). Si utilizas dominio propio, sepáralo con coma. **No uses `*`.**
4. Despliega y copia la URL HTTPS real, por ejemplo `https://photo-brawl-online.onrender.com`.
5. Comprueba `https://TU-SERVICIO.onrender.com/health`. Debe devolver `{"ok":true,"service":"photo-brawl-online","protocol":1}`.

**Nota:** el backend ahora usa `process.env.PORT || process.env.ONLINE_PORT || 8787`, imprescindible en Render. Render abre el WebSocket en el mismo host y puerto HTTPS público, con ruta `/ws`.

## 3. Crear el juego en Vercel
1. En https://vercel.com/new importa el mismo repositorio de GitHub.
2. Framework Preset: `Vite`; Root Directory: `./`.
3. Build Command: `npm run build`; Output Directory: `dist`.
4. En Environment Variables, añade:
   - Key: `VITE_ONLINE_WS_URL`
   - Value: `wss://TU-SERVICIO.onrender.com/ws`
   - Aplica a Production (y Preview solo si añades sus orígenes a Render).
5. Despliega y copia la URL real, por ejemplo `https://photo-brawl.vercel.app`.
6. Regresa a Render > tu Web Service > Environment, establece `ONLINE_ALLOWED_ORIGINS` con la URL **exacta** de Vercel, por ejemplo `https://photo-brawl.vercel.app`, sin `/` final. Guarda para reiniciar/redeployar.
7. Si has añadido la variable en Vercel **después** de desplegar, haz **Redeploy**: Vite fija las variables `VITE_` al compilar.

## 4. Prueba desde dos móviles
- Abre `https://TU-APP.vercel.app` desde dos móviles. Recarga forzando la versión nueva o prueba desde pestañas privadas para evitar la caché de PWA.
- Visita primero `https://TU-SERVICIO.onrender.com/health` para despertar una instancia gratuita si está dormida. Espera a que aparezca `ok:true`.
- Móvil A crea una sala y copia el código; móvil B se une. Los dos se marcan listos, y el anfitrión inicia desde el menú principal.
- El servidor de Render registra errores de `WebSocket origin rechazado` si `ONLINE_ALLOWED_ORIGINS` no coincide. Revisa **Render > Logs**.

## 5. Errores típicos
- **/health funciona, pero el juego dice servidor no disponible:** comprueba `VITE_ONLINE_WS_URL` (debe ser `wss://.../ws`, no `https://.../health`), redeploy de Vercel y `ONLINE_ALLOWED_ORIGINS` idéntico al origen desde el que se abre el juego.
- **Render devuelve 502 o no arranca:** mira Render > Logs y confirma Start Command y que el servidor escucha en `$PORT`.
- **La app instalada sigue fallando:** prueba URL de Vercel en ventana privada. La PWA puede estar ejecutando un bundle antiguo.
- **Una partida desaparece tras un reinicio:** las salas viven en RAM. Para la fase de pruebas usa una sola instancia de Render; una arquitectura de producción requerirá persistencia de sesiones, medición de latencia y mejora del netcode.
- **La web de Render tarda en responder:** las instancias Free hibernan después de 15 minutos de inactividad; es esperado.

## Seguridad
Este montaje es una demo online para jugar con conocidos, no infraestructura de producción. No publiques secretos en `VITE_`. Restringe los orígenes con `ONLINE_ALLOWED_ORIGINS`. Las fotos de usuarios y partidas requieren política de datos y seguridad adicional antes de publicar masivamente.
