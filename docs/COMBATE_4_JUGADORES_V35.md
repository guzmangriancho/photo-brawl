# PHOTO BRAWL V35 · 2v2, Free For All y revancha con cambio de luchadores

## Modos y arenas

- `2V2`: cuatro participantes distribuidos en EQUIPO ROJO (puestos P1/P3) y EQUIPO AZUL (puestos P2/P4). No hay daño entre compañeros. El anfitrión puede intercambiar un invitado de cada equipo antes de comenzar.
- `FREE_FOR_ALL`: cuatro participantes sin equipos. Todos pueden dañar a todos los rivales.
- Ambos formatos solamente admiten `SUNKEN_ATLANTIS`, `SPIRIT_FOREST`, `CELESTIAL_TEMPLE` y `VOLCANIC_FORTRESS`. El servidor rechaza los mapas clásicos aunque se soliciten mediante un paquete modificado. El 1v1, los mapas clásicos y sus clasificaciones siguen disponibles.
- No se añade una nueva moneda de puntos, ELO ni clasificación persistente en 2v2/FFA. Los puntos de partida son KO (asesinatos), asistencias, muertes, daño causado y vidas restantes.

## Reglas de combate

- Cada luchador empieza con **tres vidas** y su salud normal. Al agotar la barra de salud pierde una vida; si le quedan, reaparece en su posición inicial tras 100 fotogramas, con 110 fotogramas de invulnerabilidad. El luchador con cero vidas queda eliminado.
- El combate dura hasta 240 segundos (60 FPS), a menos que concluya antes por KO. No hay precipicios ni muerte al salir de cámara: las arenas tienen suelo principal continuo y paredes laterales.
- **2v2:** gana el equipo cuando los dos rivales se quedan sin vidas. **FFA:** gana el último superviviente. Si ambos equipos son eliminados simultáneamente, empate.
- **Al finalizar el reloj:** primero se comparan las vidas restantes; ante igualdad, la suma del porcentaje de salud restante de los luchadores todavía vivos. En FFA, se utiliza la clasificación de vidas y porcentaje de salud por luchador. Una igualdad exacta produce empate.
- Las asistencias contabilizan a otros rivales que hayan golpeado al eliminado en los últimos ocho segundos de combate, excluyendo al autor del último KO. La puntuación de KO pertenece al jugador que golpeó finalmente.
- Conserva las plataformas unidireccionales, la bajada apuntando recto hacia abajo, las defensas, el parry, las técnicas y los supers del motor original. No se cambian los sprite sheets: en arenas nuevas se aplican las escalas existentes del 64 %.

## Juego local

- En INICIO, elige 2 VS 2 o FREE FOR ALL, entra en OPCIONES DE PARTIDA y escoge P2, P3 y P4. P1 sigue siendo el luchador destacado.
- El primer mando/teclado controla P1; los demás son CPU, con dificultad elegible. Desde PAUSA puede habilitarse P2 de teclado para jugar dos personas localmente. Los personajes CPU siguen las reglas de equipo.

## Salas online

- Al CREAR SALA, selecciona formato 1v1, 2v2 o Free For All. Solo las salas de cuatro aparecen con cuatro asientos y mapas multinivel. Se admiten cuatro conexiones por código, cada una con su luchador, y el juego empieza cuando las cuatro están preparadas (cuenta atrás).
- La simulación es **autoritativa en Render**; los clientes envían entradas, no daño, KO, puntuaciones ni ganadores. Existen controles de velocidad de entrada y validación del perfil. La simulación se congela ante desconexiones y permite reconectar usando el token de sala dentro del período de gracia configurado.
- No se guardan ni alteran resultados ELO en los nuevos formatos. 1v1 clasificatorio conserva el flujo de registros SQL ya existente.
- La sala se cierra si un participante la abandona explícitamente durante el combate. La reconexión por suspensión temporal del móvil se intenta durante el período de gracia existente.

## Nueva pantalla de revancha

- Tras un combate con resultado, aparece un conjunto de **dos tarjetas** (1v1) o **cuatro tarjetas** (2v2/FFA) con retrato, nombre y posición, seguido por PEDIR REVANCHA y SALIR.
- Toca **CAMBIAR** sobre el propio retrato para escoger uno de los luchadores guardados localmente. En local se pueden cambiar los participantes; online, cada cliente solo cambia el suyo.
- Cada participante online debe confirmar. El servidor conserva las posiciones/equipos, valida los personajes nuevos y envía los cuatro perfiles actualizados. La revancha conserva el tipo de partida y, si el anfitrión había elegido azar, sortea de nuevo entre las arenas permitidas. El 1v1 con ELO utiliza un nuevo ID de combate como antes.

## Ficheros principales

- `src/engine/MultiFightEngine.ts` y `src/engine/FightEngine.ts`: simulación de cuatro luchadores sobre el motor original.
- `server/group-rooms.cjs`, `server/rooms.cjs`: gestión de salas, equipos, reconexión y autoritatividad.
- `src/components/GroupFightArena.tsx`, `src/components/OnlineLobby.tsx`, `src/components/CharacterSelect.tsx`, `src/components/RematchRoster.tsx`: interfaces y configuraciones.
- `tests/v35.group-battles.test.cjs`: casos para reglas, colisiones de equipo, fin de partida, sincronización, seguridad de mapas, arranque de cuatro personas y revancha.

## Despliegue y límites

1. Actualizar **Vercel y Render** al mismo commit/ZIP, ya que cambian motor y protocolo online. Compilar el motor con `npm run build:server-engine` antes de arrancar Node.
2. No se necesitan nuevas migraciones SQL para V35. Mantén las migraciones anteriores, incluida la de administrador V29 si se usa ese ajuste.
3. Ejecutar `npm ci && npm test && npm run build` en el entorno con dependencias disponibles. Para las nuevas pruebas: `npm run test:v35`.
4. Verificar visualmente en teléfonos físicos la distribución de HUD y controles, y realizar pruebas de red con cuatro navegadores remotos (latencia y suspensiones en móvil). El runtime online de cuatro jugadores dispone de pruebas automatizadas, pero no equivale a una prueba de rendimiento con cuatro móviles reales.
