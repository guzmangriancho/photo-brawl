# V58 · Avisos push sociales y combate diario

Dos novedades independientes, en commits separados y revertibles:

1. **Avisos push** (Web Push estándar) cuando un amigo te envía una **solicitud de amistad**, te **invita a un combate** o **acepta tu invitación**. Funcionan con la app cerrada.
2. **Combate diario**: cada día (UTC) todos los jugadores reciben el mismo rival, un luchador publicado de la comunidad elegido por rotación determinista, con su escenario. La primera victoria del día cuenta para los hitos del mes.

## Avisos push

### Arquitectura

- `server/push.cjs` (Render): rutas `/push/vapid-public-key`, `/push/subscriptions`, `/push/subscriptions/delete`, `/push/notify`. Usa la librería mantenida `web-push` (VAPID + RFC 8030, sin criptografía artesanal).
- El **servidor construye los textos** a partir de las filas de Supabase (vía clave secreta): el navegador solo dice «avisa de la invitación X», nunca decide el contenido ni el destinatario. Cada llamada lleva el JWT del jugador y se verifica con `verifyUser`.
- Tabla `pb_push_subscriptions` (migration `202611240001`): RLS activado, el cliente solo **lee** las suyas; altas/bajas solo con rol de servicio desde Render. Máximo 10 suscripciones por usuario; los endpoints caducados (404/410 del servicio push) se borran solos.
- `src/services/pushService.ts`: opt-in explícito desde AMIGOS → AVISOS PUSH. Deriva el host HTTP del `VITE_ONLINE_WS_URL` (`wss://host/ws` → `https://host`). `notifySocial()` es fuego y olvido: si falla, el juego no se entera.
- `public/sw.js`: handlers `push` y `notificationclick` (enfoca o abre la app). `CACHE_NAME` sube a `pb-shell-v58-push-daily`.

### Activación (una sola vez)

1. Generar par VAPID (`npx web-push generate-vapid-keys`).
2. En Render → servicio `photo-brawl-online` → Environment:
   - `VAPID_PUBLIC_KEY` = clave pública
   - `VAPID_PRIVATE_KEY` = clave privada (secreta, jamás en el repo)
   - `VAPID_SUBJECT` = `mailto:` del administrador
3. Aplicar `supabase/migrations/202611240001_v58_push_subscriptions.sql` en el SQL Editor de Supabase.
4. Comprobar `https://photo-brawl-online.onrender.com/health` (incluye `push: true`) y `/push/vapid-public-key`.

### Compatibilidad verificada (fuentes oficiales, nov 2026)

- **Safari en macOS 13+** (Safari 16+): push web en páginas normales, **sin instalar nada** (Apple: «Webpages in Safari 16 for macOS 13 or later»). https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers.md
- **iOS/iPadOS 16.4+**: solo si la web está **añadida a la pantalla de inicio** (PWA). Es una limitación de Apple, no de esta app.
- **Chrome, Edge, Firefox** (Android y escritorio): Push API «widely available» desde marzo 2023. https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- Safari exige mostrar la notificación al recibir el push (si no, revoca el permiso): el SW siempre la muestra.
- Sin soporte → el bloque AVISOS PUSH no aparece; el juego funciona igual.

## Combate diario

- Migration `202611240002`: `pb_daily_features` (un reto por día UTC) y `pb_daily_results` (un resultado por cuenta y día). RPC `pb_daily_today()` materializa el reto la primera vez que alguien lo pide; `pb_daily_record()` valida marcador coherente (2 rondas al ganador), aplica **primera victoria cuenta** y permite reintentar tras perder.
- Selección determinista: `order by md5(fighter_id || día)` sobre luchadores `is_public` → todos ven el mismo rival sin sorteo central ni estado extra. Solo arte **público** de comunidad; no se toca el bucket privado.
- Recompensas cosméticas por mes natural: títulos a 3 (CALENTANDO), 7 (CONSTANTE), 14 (VETERANO), 21 (IMPARABLE) y 28 (LEYENDA DEL MES) victorias. El máximo es 28 para que sea alcanzable incluso en febrero: ningún hito es imposible en ningún mes. Sin rachas punitivas: perder un día no quita nada.
- **No suma ELO ni copas** (el ranked sigue validándolo solo el servidor online) y no cambia reglas Ultimate.
- UI: tarjeta COMBATE DIARIO en Inicio con rival, escenario, victorias del mes y próximo hito. El combate es `1P_VS_CPU` normal; al terminar, `FightArena` registra el resultado una sola vez y la tarjeta se actualiza.

### Activación

Aplicar `supabase/migrations/202611240002_v58_daily_battles.sql` en el SQL Editor. Sin variables nuevas.

## Privacidad y límites

- Los avisos son **opt-in por dispositivo** y se desactivan desde el mismo panel.
- La suscripción (endpoint) es un secreto de capacidad: viaja cifrada y la guarda solo el servidor; la tabla no expone escrituras al cliente.
- El reto diario usa exclusivamente luchadores que sus dueños ya publicaron en Comunidad.

## Pruebas

`npm run test:v58` — contratos de servidor push, RLS, determinismo del día, coherencia de resultados, hitos ≤28 y cableado UI.

## Revertir

Los 23 commits de V58 en `main` son independientes por archivo. Para revertir solo una novedad:

- **Avisos push (10 commits)**: `V58: dependencia web-push para avisos`, `V58: servidor de avisos Web Push (web-push, VAPID por entorno)`, `V58: endpoints de avisos push en el servidor`, `V58: lockfile con web-push`, `V58: tabla pb_push_subscriptions con RLS (escrituras solo rol servicio)`, `V58: cliente push (suscripcion y envio al servidor)`, `V58: service worker muestra avisos push`, `V58: estilos del boton de avisos en Amigos`, `V58: opt-in de avisos push en Amigos + avisos de solicitud, invitacion y aceptacion`, `V58: aviso push al aceptar combate (selector)`. Tras revertir, borra las variables `VAPID_*` en Render; la tabla `pb_push_subscriptions` puede quedar sin uso.
- **Combate diario (6 commits)**: `V58: combate diario comunitario (seleccion determinista, primera victoria, reintentos)`, `V58: cliente de combate diario`, `V58: modo diario en arena (reintentos, snapshot de victoria)`, `V58: estilos tarjeta combate diario`, `V58: tarjeta de combate diario en Inicio con hitos cosmeticos del mes`, `V58: cableado del combate diario en App`. La tabla del combate diario puede quedar sin uso.
- **Pruebas y documentación (7 commits)**: `Tests: v57 resuelve typescript desde node_modules local (portabilidad)` (independiente de V58), `Tests: v15 soporta servicios nuevos en el harness`, `Tests: v50 admite nuevo nombre de cache del SW`, `Tests: v52 admite nuevo nombre de cache del SW`, `V58: pruebas de contrato (push + diario)`, `V58: documentacion de avisos push y combate diario`, `V58: scripts y metadatos de pruebas v58`.

Orden recomendado: revierte primero los commits de cliente y después los de servidor/SQL de la misma novedad, para que la app nunca llame a rutas retiradas. En `CharacterSelect.tsx` el commit del combate diario sustituye al de avisos push: revertir solo el diario restaura la versión con avisos.
