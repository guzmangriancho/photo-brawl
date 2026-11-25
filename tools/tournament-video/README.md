# Vídeo de torneo (generador)

Entra un torneo terminado, sale un vídeo vertical 1080x1920 listo para descargar: intro con el título, los combates
(todo el escenario, sin barras de vida, nombres sobre cada luchador), pantalla de campeón y audio.
Usa el motor real del juego (la copia archivada de la versión con la que se jugó el torneo, `server/tournament/archive/eN`),
así que el vídeo reproduce exactamente los combates guardados (semilla, tácticas y luchadores congelados).

## Uso
```
cd tools/tournament-video && npm install            # solo @napi-rs/canvas; necesita ffmpeg y python3+numpy
PB_API_BASE=https://servidor PB_TOKEN=... node export-tournament.cjs ID_TORNEO export.json   # usa la API existente
node spec-from-export.cjs export.json spec.json --day 1     # export.json = JSON del torneo (tournament, rounds, matches)
./run.sh spec.json salida [MB]                      # => salida.master.mp4 y salida.whatsapp.mp4 (<= 15.5 MB por defecto)
```
- `make.cjs` dibuja el vídeo mudo y apunta cada golpe en `*.events.json`; `audio.py` sintetiza música y efectos; `run.sh` lo une y comprime.
- Rondas con más de 6 combates se parten en tramos de 6 (combates simultáneos superpuestos, un color por combate).
- `--day N` pone el rótulo "TORNEO · DÍA N" (intro y pantalla de campeón); el número lo fija quien lanza el vídeo, no se saca de ninguna fecha. Sin `--day` el rótulo es solo "TORNEO".
- Velocidad: 6x(prelim/cuartos), 4x (semifinales), 3x (final); cambia `spf` por tramo en el spec.
- Un spec de un showcase con luchadores de la comunidad (sin torneo real) se arma a mano con el mismo formato: `fighters`, `rounds[].fights[] {a,b,seed}`, `champion`.

## Audio: autoría
Música chiptune y efectos sintetizados por `audio.py` (numpy). Sin muestras ni música de terceros: autoría de este repositorio, sin licencias externas.
La fuente Press Start 2P (assets/) es SIL Open Font License 1.1 (la misma que ya usa el juego).

## Estado / pendiente de integrar
Funciona por línea de comandos en una máquina con node, ffmpeg y python. Para botón de descarga en la app haría falta: un job en el servidor
online que ejecute `run.sh` al terminar un torneo, guardar el mp4 (p. ej. en storage) y un endpoint/botón que lo sirva. Eso no está hecho ni desplegado.
Publicar en redes exige además el consentimiento de los creadores de los luchadores.

## Validación antes de renderizar
`validate.cjs` vuelve a simular cada combate de la exportación con el motor archivado de su versión y exige el mismo ganador, marcador, frames y semilla. `spec-from-export.cjs` lo ejecuta primero y no genera nada si falla, para que el vídeo nunca reescriba la historia. Cada combate debe traer `roundsToWin` (e1 siempre 2; si falta en e2 se rechaza). Solo imprime contadores, nunca tácticas ni cuentas.

## Despliegue (preparado, nada activo)
Flujo: el admin pulsa GENERAR VÍDEO en la pantalla del torneo terminado, el servidor de Render lanza `.github/workflows/tournament-video.yml` (workflow_dispatch, solo id y día), el workflow exporta (`/tournament/export`), valida, renderiza y sube la copia ligera a `PUT /tournament/video-upload`; el servidor la guarda en el bucket privado `tournament-videos` y la app ofrece una URL firmada de 5 min.
- Servidor (`server/tournament/video.cjs`): `GET/POST /tournament/video` (solo propietario, vía `pb_is_admin`), `PUT /tournament/video-upload` y `POST /tournament/video-failed` (secreto compartido, solo con petición abierta). Todo da 404 si faltan `VIDEO_EXPORT_SECRET` y `GITHUB_DISPATCH_TOKEN`.
- Variables en Render: `VIDEO_EXPORT_SECRET` (24+ caracteres aleatorios), `GITHUB_DISPATCH_TOKEN` (fine-grained, solo este repo, permiso "Actions: write"). Opcionales: `GITHUB_REPO`, `GITHUB_WORKFLOW`, `GITHUB_REF_NAME`.
- Secretos en GitHub: `PB_API_BASE` y `PB_EXPORT_SECRET` (el mismo valor que `VIDEO_EXPORT_SECRET`). Ninguna clave de Supabase en GitHub, sin artefactos, sin datos de torneo en logs.
- Migración `202611250004`: bucket privado `tournament-videos` (20 MB, mp4) y tabla `tournament_videos` (solo servidor).
- Límite: el vídeo crece con el número de combates (6 combates superpuestos por tramo); el workflow corta a los 30 min.
