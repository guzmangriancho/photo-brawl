# PHOTO BRAWL V12 — Correcciones de jugabilidad y experiencia móvil

## Incluye

1. **Chroma key con agujeros interiores.** `src/engine/chromaKey.ts` segmenta el verde por celda 256×256. Elimina el verde conectado al borde de cada celda, **y también** componentes encerrados con color muy próximo a #00FF00. En los componentes interiores exige homogeneidad y pureza cromática para conservar prendas verdes normales. Reduce el derrame verde sobre bordes. Nota: si una prenda usa el mismo color exacto que el fondo, no existe una separación perfecta sin máscara manual; conviene usar un tono distinto de verde.
2. **Personajes antiguos reparados.** Una migración única de luchadores personalizados guardados procesa solo la transparencia, sin escalar ni recentrar las celdas. Conserva sus estadísticas, imágenes originales guardadas, movimientos y nombre. Se marca `spriteSheetKeyVersion:2` y se guarda en IndexedDB. Los presets no se modifican.
3. **Proyectiles online auténticos.** El servidor no manda imágenes PNG en cada estado de combate: manda `ownerIndex` y datos del proyectil; el cliente asocia el spritesheet ya recibido del propietario para pintar la celda del proyectil. Efectos especiales que no usan sprite siguen usando su visual propio.
4. **Personaje del menú sin estirar.** El recorte de celda idle se presenta en un cuadrado real, que respeta ambos ejes del espacio disponible.
5. **Creador en móvil.** Márgenes y gap compactos, columnas y filas redistribuidas en horizontal/vertical y controles inferiores siempre visibles incluso en pantallas de altura reducida. Se mantiene el asistente en cuatro pasos y el borrador automático.
6. **Online sin anfitrión que pulse iniciar.** Al estar ambos conectados y listos, el servidor marca `countdown` y calcula `countdownEndsAt`. La cuenta atrás de 3 segundos se muestra en el lobby de ambos jugadores; al acabar el servidor inicia el combate. Si alguien se desmarca o desconecta, se cancela. No se acepta un comando manual `start`. El escenario se elige antes del ready-up.
7. **Mejor de tres (primer jugador con dos rondas).** Después de cada KO o victoria por tiempo: dos segundos para ver el resultado; nuevos jugadores, HP y reloj; transición 3–2–1 de la ronda siguiente. La victoria final requiere dos rondas. El marcador acompaña al cronómetro; el servidor transmite el número de ronda y victorias en sus snapshots. La revancha reinicia el encuentro entero, no solo una ronda. TRAINING sigue siendo práctica libre salvo que se alcance un KO.
8. **WebSocket fragmentado.** V12 ya incluye `server/transport.cjs` corregido para mensajes grandes, lo que permite transmitir spritesheets por WebSocket con frames fragmentados.

## Publicar sobre Render + Vercel

Descomprime la V12 en la misma carpeta de proyecto de GitHub, reemplaza el contenido anterior, y desde ella ejecuta:

```bash
git add .
git commit -m "V12 green screen, online sprites, auto start and rounds"
git push origin main
```

Render continúa con `npm install && npm run build:server-engine`, `node server/index.cjs` y `/health`. Vercel con `npm run build` y salida `dist`. Usa las variables anteriores: `VITE_ONLINE_WS_URL=wss://photo-brawl-online.onrender.com/ws` en Vercel y `ONLINE_ALLOWED_ORIGINS=https://TU-URL-VERCEL` en Render.

**Importante:** espera a que Render y Vercel estén ambos en `Live/Ready` antes de jugar. La PWA v12 cambia su nombre de caché para forzar la renovación del código. Puedes cerrar y reabrir la app instalada.

## Comprobaciones

- `tsc -p server/tsconfig.json`: compila motor autoritativo, reglas y procesador de imágenes.
- `node --test tests/online.test.cjs tests/online.fragments.test.cjs tests/v12.rules.test.cjs`: tests automatizados del protocolo, reconexión, cancelación de cuenta atrás, proyección de sprites, recorte verde y rounds.
- `npm run test:engine`, `npm run test:creator`, `npm run test:pwa`: regresiones del motor, Gemini y PWA.

Queda pendiente una validación táctil y visual completa en dispositivos físicos, especialmente para móviles pequeños, y comprobar una partida de dos usuarios entre redes distintas sobre los nuevos despliegues.
