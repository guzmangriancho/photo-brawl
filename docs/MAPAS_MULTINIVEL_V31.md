# PHOTO BRAWL V31 — Arenas multinivel y depuración de colisiones

## Nuevos mapas

| ID | Imagen original | Plataformas | Suelo Y (mundo 960×540) |
|---|---|---:|---:|
| `SUNKEN_ATLANTIS` | `public/backgrounds/atlantis.jpg` | 4 | 454 |
| `SPIRIT_FOREST` | `public/backgrounds/forest.jpg` | 3 | 453 |
| `CELESTIAL_TEMPLE` | `public/backgrounds/celestial.jpg` | 3 | 446 |
| `VOLCANIC_FORTRESS` | `public/backgrounds/volcan.jpg` | 3 | 436 |

Se han reutilizado literalmente las cuatro imágenes originales facilitadas por el usuario, cambiando únicamente la extensión del archivo a `.jpg`. Su resolución original es 2048×1143 y el motor las dibuja en su lienzo lógico de 960×540. Se han alineado manualmente los valores de `x1`, `x2` e `y` con las caras superiores de las plataformas de cada imagen.

## Cómo corregir una colisión con una captura

1. Selecciona un mapa nuevo en **Inicio → Opciones de partida**, elige **Training** e inicia el combate.
2. Pulsa **COLISIONES OFF**, situado a la izquierda de la arena, para activarlo. También está disponible en **PAUSA**.
3. Las líneas **cian** muestran el borde de aterrizaje *real* de cada plataforma. Cada etiqueta contiene su ID y las coordenadas exactas de izquierda, derecha y altura.
4. La línea **verde** es la altura exacta del suelo sólido. Los cuadrados amarillo/rosa indican los pies de ambos luchadores; su etiqueta señala la posición actual y si están apoyados.
5. Envía la captura con el mapa y la plataforma que no encaja. Para ajustar una plataforma se modifican `x1`, `x2` o `y` en `src/data/stages.ts` → `LARGE_ARENAS`. Las coordenadas no dependen del tamaño del teléfono.

Las plataformas se atraviesan al saltar desde abajo; solo detienen al luchador si su pie cruza el borde **en caída**, horizontalmente dentro de la plataforma. Para bajar, mantén **ABAJO** y pulsa **SALTO**; el suelo nunca es atravesable. El salto en estas arenas tiene un factor de impulso 1,22 para que los tanques también puedan subir. El luchador reduce su escala visual/física a 0,64 sin modificar los sprites originales; los hitboxes de ataque normales se adaptan, conservándose los alcances de habilidades de pantalla completa.

## Cámara

La cámara solo aplica una transformación gráfica al render; **no modifica el mundo del motor, la hitbox ni los paquetes de red**. Cuando ambos jugadores se agrupan cerca en un mismo lado, se acerca suavemente hasta el **110 %**. El encuadre se limita para evitar enseñar fuera del escenario, y vuelve a 100 % cuando se separan. El debug se dibuja con la misma transformación.

## Compatibilidad

Las cinco arenas clásicas conservan `FLOOR_Y = 472`, escalas y física anteriores. En los nuevos mapas, el servidor de Render usa exactamente las mismas geometrías que el frontend porque compila `src/engine/FightEngine.ts` y `src/data/stages.ts` a `server/runtime`. Se añaden IDs al listado del servidor, incluido el selector aleatorio. El frontend actualiza `getLargeArena` en una revancha online incluso cuando se cambia automáticamente de escenario.

No se añade ningún modo nuevo: las arenas están preparadas geométricamente para un futuro 2v2/FFA pero hoy siguen siendo combates 1v1. **No hay una nueva migración Supabase**: las partidas clasificatorias guardan el escenario en una columna `text`.

## Verificación

- `npm run test:v31`: comprueba assets, IDs, geometrías, aterrizaje en 14 plataformas, descenso con ABAJO + SALTO, continuidad del suelo, escalas, mapas clásicos y revanchas online.
- `npm test` conserva las suites anteriores.
- `npm run build:server-engine` compila el servidor.
- `npm run build` requiere las dependencias completas de React/Vite y sus tipos. Si el entorno no las tiene instaladas, ejecutar `npm ci` antes en el entorno de despliegue.

**Pendiente:** prueba visual en dispositivo real (la imagen y las líneas se pueden ajustar tras tus capturas), y validación de CPU, proyectiles y supers en todas las alturas durante partidas prolongadas.
