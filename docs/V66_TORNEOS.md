# V66 - Torneos por rondas

- Tablas: `tournaments`, `tournament_entries`, `tournament_entry_tactics`, `tournament_matches` (RLS sin acceso de cliente; solo el servidor con la clave de servicio).
- Estado y transiciones: funciones `pb_tournament_*` (migración 202611250001). Cada transición es atómica e idempotente (corte único, `claim` de ronda con lease, finalización única).
- Servidor: `server/tournament/` + rutas `/tournament/*`. Motor archivado en `server/tournament/archive/e1` (copia inmutable; cambiar el motor = nuevo archivo e2, nunca editar e1).
- Resolución: `/tournament/tick` (público, limitado por IP, hueco mínimo 5 s, un tick a la vez), llamado por el temporizador del servidor, por `pg_cron` (migración 202611250002, opcional) y por clientes que ven una cuenta atrás en 0.
- Primer torneo: NO se crea solo. Insertar a mano con `pb_tournament_create_next` (ver migración).
- Límites: si el servidor duerme o el cron falla, las rondas se resuelven con retraso (minutos), nunca se pierden ni se duplican. El tiempo por combate depende de la CPU del servidor.
- Vídeo de combates: fuera de esta versión.
- Tests: `npm run test:v66`, e2e local `bash tests/tournament-e2e/run.sh` (requiere Postgres/PostgREST locales).
