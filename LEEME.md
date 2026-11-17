# PHOTO BRAWL — Fix del transporte WebSocket (Render)

## Qué corrige

El transporte anterior cerraba WebSocket cuando recibía un frame de texto con FIN=0 (fragmentado). Un proxy o cliente puede dividir mensajes grandes en varios frames; esto provocaba `1005`/`1006` en el navegador y `Servidor online no disponible` en el juego.

Este cambio acepta correctamente las continuaciones RFC 6455, admite PING intercalado, limita el tamaño acumulado a 8 MiB, y responde con códigos de cierre útiles cuando hay tramas inválidas.

## Instalación

1. Copia `server/transport.cjs` sobre el mismo archivo de tu proyecto.
2. (Opcional) Copia `tests/online.fragments.test.cjs` dentro de `tests/`.
3. Confirma y sube a la rama `main` de GitHub; Render hará autodeploy.
4. Espera a ver `Your service is live` en los logs de Render.
5. Recarga PHOTO BRAWL en Vercel e intenta crear una sala con MAGA NEÓN.

No hay que cambiar el frontend, las variables de Vercel, Render ni Supabase. No hace falta ejecutar una nueva compilación de Vercel.

## Comandos Git

```bash
git add server/transport.cjs tests/online.fragments.test.cjs
git commit -m "Fix fragmented WebSocket profile uploads"
git push origin main
```

## Verificación

Se ejecutaron estas pruebas sobre el proyecto original: `node --test tests/online.test.cjs tests/online.fragments.test.cjs`, resultado: 6/6 OK.

## Si sigue fallando

Abre Render > Logs mientras creas la sala; busca `[online] Frame WebSocket rechazado:` o reinicios del proceso. La prueba reproduce mensajes fragmentados pero no ha sido ejecutada en el despliegue real de Render, así que aún podría existir otra causa.
