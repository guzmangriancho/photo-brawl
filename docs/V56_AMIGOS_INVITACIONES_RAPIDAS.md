# PHOTO BRAWL V56 · Amigos e invitaciones directas

**Base:** V55 completa. **Fecha:** 19/11/2026. **Alcance:** frontend React y SQL Supabase. **Render:** se reutilizan las salas existentes y el mismo protocolo WebSocket, sin alterar el motor ni los resultados ranked.

## Objetivo y decisiones

Permitir invitar en **1v1 amistoso o ranked, 2v2 amistoso o ranked y Free For All amistoso o ranked** desde una lista de amigos, sin transcribir códigos. Los modos locales contra CPU, práctica y la pantalla compartida siguen siendo locales, así que no requieren invitación online.

**Recorrido de amistad:** abrir **AMIGOS** en el inicio; buscar por `@username` exacto o pulsar **AÑADIR AMIGO** en el perfil público; el receptor recibe una solicitud (también si no estaba conectado); la acepta o rechaza. Al recibir una solicitud recíproca se confirma la amistad automáticamente. Se puede eliminar o cancelar una solicitud.

**Recorrido de invitación:** desde **AMIGOS** elegir modalidad y AMISTOSO/RANKED, pulsar **INVITAR** junto a un amigo. Se crea una sala real solo cuando hace falta, y se envía la invitación por Supabase. Si el anfitrión ya está en una sala en espera, se reutiliza. Desde el lobby también se usa **AMIGOS** sin salir ni copiar códigos. El destinatario ve un aviso mientras navega por la app, o lo encuentra en AMIGOS; pulsa **UNIRME** y se conecta por WebSocket automáticamente. Antes de presentar la sala, el cliente comprueba que el modo y la condición ranked anunciados coinciden con los que informa Render.

Para **2v2**, los equipos se organizan con el control de **INTERCAMBIAR P2 Y P3 DE EQUIPO** del lobby; invitar a un amigo NO le asigna automáticamente tu mismo equipo. Los cuatro jugadores deben estar presentes y listos para comenzar. Para FFA, se pueden invitar tres amigos. Para 1v1, un solo rival ocupa la segunda plaza; las demás invitaciones a la misma sala dejan de ser válidas cuando ésta se llena.

Los códigos y enlaces antiguos **se conservan** para jugadores que todavía no son amigos. No se cambian ELO, copas, liga, historial ni fichas.

## Persistencia y seguridad

- `pb_friendships`: una única relación por par de usuarios (UUID ordenados), solicitud pendiente o amistad aceptada. No se confía en nombres de usuario para identificar identidades persistentes.
- `pb_game_invitations`: destinatario, remitente, código de sala, modo, ranked, estado y caducidad (15 minutos). Se persiste en Supabase para recuperar invitaciones recientes al volver a abrir.
- Todas las operaciones de escritura son funciones SQL `SECURITY DEFINER` con `auth.uid()` y permisos **exclusivos para `authenticated`**. Las tablas de solo lectura tienen RLS por participantes, sin `INSERT/UPDATE/DELETE` desde el cliente. Solo se invita a amigos confirmados, nunca a uno mismo, con límites de solicitudes e invitaciones por tiempo. La sala no se crea en SQL y no se da por válida sin el servidor de combate.
- Supabase Realtime escucha cambios con RLS y la UI consulta nuevamente cada 12 segundos y al enfocar, para cubrir la ausencia de WebSocket de Realtime. Realtime y el polling requieren conexión activa.
- **No hay push del sistema operativo:** con la PWA totalmente cerrada no se envía una notificación externa. Si se reabre antes de que caduque la invitación, ésta estará disponible.
- La autenticidad del *propietario* de cada código de sala todavía depende de la confianza en el remitente amigo; el SQL no puede confirmar que ese amigo sea el anfitrión de la sala de Render. Como defensa, la entrada contrasta el tipo real de sala y ranked antes de sustituir la sesión activa. Para una futura protección criptográfica del remitente del código sería necesario modificar Render para emitir tokens de invitación firmados.

## Migración y despliegue

1. Asegura una copia de seguridad de Supabase y las migraciones previas de V16 a V55.
2. Ejecuta **`PHOTO_BRAWL_V56_MIGRACION_AMIGOS_INVITACIONES.sql`** (idéntico al archivo de `supabase/migrations/202611190003_v56_friends_invites.sql`) en SQL Editor. No borra perfiles, amigos, colecciones, resultados ni copas.
3. Despliega Vercel con el código V56. No cambies el servidor Render si ya está ejecutando la V55 compatible.
4. Ejecuta `npm ci`, `npm run build` y `npm run test:v56` localmente.
5. Prueba con dos cuentas reales: A envía solicitud a B; B acepta; A invita 1v1 amistoso; B pulsa UNIRME sin código. Repite con ranked y con cuatro cuentas en 2v2 y FFA. Comprueba en otra sesión que las invitaciones pendientes aparecen y las caducadas desaparecen. Comprueba rechazar, borrar amigo y no poder responder o invitar en nombre de un tercero.

## Validación realizada

Se ha validado la sintaxis TS/TSX de los archivos afectados. Han pasado **234 pruebas automatizadas**, incluyendo las 8 nuevas pruebas V56 de contratos de SQL, uso de sesiones online existentes, controles de UI, caducidad y diseño (ejecución `NODE_PATH=... node --test tests/v*.test.cjs`). **Sin una instancia de Supabase/Render de pruebas conectada no se puede verificar el recorrido multicuenta extremo a extremo**. El `npm ci` no ha podido finalizar en este entorno, así que la compilación final queda pendiente en el entorno de despliegue.

## Investigación

Documentación oficial de Supabase: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Database Functions](https://supabase.com/docs/guides/database/functions), [Subscribing to Database Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes), [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization). Supabase recomienda Broadcast para alta escala; Postgres Changes es la opción sencilla adecuada para el volumen inicial, con RLS y consulta periódica de respaldo. Si aumenta significativamente el número de jugadores conectados, migrar a Broadcast privado con autorización de canales y límites de frecuencia.
