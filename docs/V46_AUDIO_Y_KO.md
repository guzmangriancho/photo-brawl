# PHOTO BRAWL V46 — Mezcla arcade y feedback de KO

## Objetivos

- Conservar los tonos sintetizados 16-bit del proyecto, pero eliminar el caos acústico en peleas de 4.
- Una pérdida de vida **no es** una victoria de partida: nunca lanzar fanfarria completa por cada stock.
- Hacer que el KO final y la pose del vencedor puedan verse antes del panel de revancha.
- No alterar la física de ataques, ELO, stock, reglas de equipos ni el cálculo de resultados del servidor.

## Mezcla

La clase `SoundFXEngine` centraliza sus eventos de audio con prioridad, cooldown y presupuesto de eventos.

| Prioridad | Sonidos | Política |
|--|--|--|
| Baja | fallo, salto, dash | Muy discretos, se omiten durante KO/súper |
| Media | jab, bloqueo, proyectil | Un máximo de frecuencia por tipo, atenuados en 2v2/FFA |
| Alta | fuerte, agarre, parry | Sobresalen sin apilar 3 capas simultáneas |
| Crítica | súper, KO, victoria | Protegidos del ruido de golpes repetitivos |

- Límite de **5 eventos activos en 4 jugadores** y **8 en 1v1**; un evento puede tener varias capas muy cortas.
- Cooldown más estricto (×1,8) y atenuación para los eventos de prioridad baja-media en 4 jugadores.
- Compresor `DynamicsCompressorNode` y volumen maestro; sonidos muy intensos no suman su pico directamente sobre la salida.
- 16-bit, WebAudio, sin ficheros ni librerías externas.
- `setCrowdedCombat` se restaura al salir del modo de cuatro jugadores.

## KO y final de partido

1. En el instante de KO, sonido de impacto grave y brillante + hitstop existente. En 2v2/FFA aparece un **K.O.!** breve, con píxeles de luz, identificador del jugador caído y aviso de pérdida de vida o eliminación.
2. Si solo se pierde una vida, continúa el combate y el sonido vuelve al perfil tranquilo.
3. Si el KO decide la victoria: los supervivientes ganadores realizan la pose `VICTORY`; el último caído termina su animación física sin nuevos ataques. La arena sigue visible.
4. **1,45 segundos después de terminar la partida**, aparece el panel de resultado y revancha, tanto local como online. En un KO final de 1v1 se muestra primero **K.O.!** y luego el ganador.
5. Render conserva el resultado autoritativo inmediato para ranking/revancha; el retraso es **solo de presentación en el frontend**, no se modifica la clasificación ni el servidor de resultados.
6. En online 2v2/FFA, cada cliente reproduce KO/ganador según cambios reales en las vidas de los snapshots (no recalcula KO ni modifica ELO).

## Verificación

- `npm run build:server-engine`
- `node --test tests/v46.audio-ko-feedback.test.cjs`
- `node --test tests/v35.group-battles.test.cjs tests/v39.multiplayer-polish.test.cjs`
- `npm run build` cuando el equipo tenga las dependencias npm instaladas.
- **Prueba manual recomendada:** KO que quita una vida y KO de fin de partida en 1v1, 2v2 y Free For All, tanto local como 4 dispositivos online; volumen de sonido en Android/iPhone con altavoz.

## Criterio de diseño

Priorización de voces y límites por evento (FMOD):
https://www.fmod.com/docs/studio/event-macro-controls-reference.html
https://fmod.com/docs/2.04/studio/advanced-topics.html

Audio ducking y jerarquía de canales (Game Developer):
https://www.gamedeveloper.com/audio/game-audio-theory-ducking

Impacto percibido por hitstop, reacción y audio (Game Feel, Steve Swink):
https://studio.eecs.umich.edu/confluence/download/attachments/17827062/Game%20Feel.pdf?api=v2
