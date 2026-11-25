# V69 - Equilibrio de combate (motor v3)

Medido con 4368 combates CPU contra CPU (14 luchadores publicados, todos contra todos, ambos lados, 6 escenarios, 4 estilos tacticos, BO1, dificultad NORMAL).

| Luchador | % victorias antes (v2) | despues (v3) |
| --- | --- | --- |
| FERBYRAVERO | 89 | 63 |
| FLORBOMBIN | 73 | 51 |
| RUINA REX | 73 | 67 |

## Cambios (solo con `simVersion >= 3`, los combates antiguos se repiten igual)

- **Agarre (COMMAND_GRAB_SLAM)**: dano 132 a 105, arranque 7 a 9, recuperacion +6, ya no lleva la armadura de HEAVY_ARMOR_STARTUP.
- **Omega Suplex**: dano 265 a 215.
- **Teletransporte (TELEPORT_BEHIND)**: arranque 6 a 12, recuperacion +6, dano 90 a 74.
- **Meteoro (METEOR_SCREEN_DROP)**: dano 265 a 170, arranque 4 a 11, recuperacion 16 a 28, caja de golpe 260 a 210 de ancho.
- **Subida invencible (INVINCIBLE_UPPERCUT)**: invencible 15 a 9 fotogramas, recuperacion +4, dano 98 a 90.
- **Embestida blindada (ARMORED_SHOULDER_DASH)**: dano 90 a 78, recuperacion +4. La armadura absorbe el golpe con 85% del dano (antes 65%).

## Counters nuevos

- Un agarre **no atrapa a quien esta en el aire** (saltar).
- **Grab tech**: pulsar GUARDIA justo antes del contacto (5 fotogramas) rompe el agarre especial (sin dano, el agresor queda aturdido). No vale contra el Suplex (super).
- Teletransporte: arranque largo, se puede bloquear de pie (golpe ALTO) y deja al atacante expuesto al fallar.
- Armadura: los agarres la ignoran (ya era asi).

## Versionado

`SIM_VERSION = 3`, motor archivado `server/tournament/archive/e3`. Los torneos e1/e2 siguen con su motor congelado; el cliente repite sus combates con `engine.simVersion` = la version guardada. `tests/v69.balance-v3.test.cjs` comprueba que v2 sigue igual que el archivo e2.

## Metodologia y limites

Es una simulacion CPU contra CPU, no una prueba con jugadores humanos. 4368 combates = 14x13 parejas x 2 lados x 6 escenarios x 4 estilos tacticos (por defecto, cerca, a distancia, tecnica), semilla fija por combate. Margen de error de cada porcentaje por luchador: aprox. +-3.8 puntos (95%). Todos los luchadores publicados suman 100 puntos de estadisticas, asi que las diferencias vienen de movimientos y pasivas. Prueba de causa en Ruina Rex: cambiar su super METEORO por RAYO LASER baja su porcentaje de 72 a 55 (antes de este ultimo ajuste del meteoro). Siguen flojos Rayo, Los Simpson y Don Farol, sin tocar: no se ha buscado forzar un 50% para todos.
