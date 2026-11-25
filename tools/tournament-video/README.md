# Vídeo de torneo (generador)

Entra un torneo terminado, sale un vídeo vertical 1080x1920 listo para descargar: intro con el título, los combates
(todo el escenario, sin barras de vida, nombres sobre cada luchador), pantalla de campeón y audio.
Usa el motor real del juego (la copia archivada de la versión con la que se jugó el torneo, `server/tournament/archive/eN`),
así que el vídeo reproduce exactamente los combates guardados (semilla, tácticas y luchadores congelados).

## Uso
```
cd tools/tournament-video && npm install            # solo @napi-rs/canvas; necesita ffmpeg y python3+numpy
node spec-from-export.cjs export.json spec.json     # export.json = JSON del torneo (tournament, rounds, matches)
./run.sh spec.json salida [MB]                      # => salida.master.mp4 y salida.whatsapp.mp4 (<= 15.5 MB por defecto)
```
- `make.cjs` dibuja el vídeo mudo y apunta cada golpe en `*.events.json`; `audio.py` sintetiza música y efectos; `run.sh` lo une y comprime.
- Rondas con más de 6 combates se parten en tramos de 6 (combates simultáneos superpuestos, un color por combate).
- Velocidad: 6x(prelim/cuartos), 4x (semifinales), 3x (final); cambia `spf` por tramo en el spec.
- Un spec de un showcase con luchadores de la comunidad (sin torneo real) se arma a mano con el mismo formato: `fighters`, `rounds[].fights[] {a,b,seed}`, `champion`.

## Audio: autoría
Música chiptune y efectos sintetizados por `audio.py` (numpy). Sin muestras ni música de terceros: autoría de este repositorio, sin licencias externas.
La fuente Press Start 2P (assets/) es SIL Open Font License 1.1 (la misma que ya usa el juego).

## Estado / pendiente de integrar
Funciona por línea de comandos en una máquina con node, ffmpeg y python. Para botón de descarga en la app haría falta: un job en el servidor
online que ejecute `run.sh` al terminar un torneo, guardar el mp4 (p. ej. en storage) y un endpoint/botón que lo sirva. Eso no está hecho ni desplegado.
Publicar en redes exige además el consentimiento de los creadores de los luchadores.
