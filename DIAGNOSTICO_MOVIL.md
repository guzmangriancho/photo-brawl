# Corrección de la conexión online en móviles

1. Extrae este paquete encima de la V11, sustituyendo archivos.
2. Detén los servidores y ejecuta `npm run dev:online`.
3. Abre `http://IP_DEL_PC:5173/` desde el móvil y recarga completamente la página.
4. Si tienes `VITE_ONLINE_WS_URL` en `.env` o `.env.local`, elimínala durante las pruebas LAN y reinicia Vite.
5. La conexión WebSocket usará ahora la misma dirección que el juego (`ws://IP_DEL_PC:5173/ws`), y Vite la reenviará al servidor Node en 8787.
6. Para despliegue real HTTPS necesitarás un backend wss:// propio y `VITE_ONLINE_WS_URL` configurada.

No cambia personajes, combates, PWA ni datos de usuario.
