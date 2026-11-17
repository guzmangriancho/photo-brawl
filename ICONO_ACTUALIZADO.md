# PHOTO BRAWL — icono de aplicación

Se ha integrado el diseño aportado por el usuario en `public/icons`:

- `icon-192.png` y `icon-512.png`: PWA Android / escritorio.
- `icon-maskable.png`: versión con margen de seguridad para máscaras de Android.
- `apple-touch-icon.png`: icono para pantalla de inicio en iPhone/iPad.
- `favicon.png`: pestaña del navegador.

La caché de PWA en `public/sw.js` cambia de nombre para favorecer su actualización.

Para desplegar: sustituye los archivos en el proyecto, haz commit y push. Si ya tienes la app instalada, puede ser necesario desinstalar y volver a instalar para que el sistema operativo actualice el icono del acceso directo.
