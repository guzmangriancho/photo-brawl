# PHOTO BRAWL V18 · SOMBRAS, HUD E IDLE

Esta versión se basa en la V17 y no cambia el motor de combate, las colisiones, los estados de red ni los datos de jugadores.

## Sombras del escenario

- Se ha retirado el rectángulo negro de `FightEngine.renderShadow`.
- Sombra de contacto suave con penumbra elíptica, núcleo de oclusión y transparencia gradual.
- Al saltar, la sombra se separa, aumenta ligeramente su tamaño y se atenúa; al aterrizar reaparece el contacto.
- El efecto se dibuja detrás de los sprites y se adapta al tamaño del luchador.
- Solo modifica el renderizado Canvas; no cambia físicas ni posición del suelo.

## Retratos del HUD

- Ambos retratos usan una caja colocada en una columna de la cuadrícula.
- La imagen cubre exactamente la altura de nombre + vida + súper (sin superponer el resto del HUD).
- El lado P2 mantiene su composición simétrica; la imagen usa `object-fit: cover`.
- Ajustes de anchura específicos para landscape de móvil, landscape pequeño y portrait.
- Prueba de maquetación efectuada con 320×650, 390×844, 667×375, 844×390 y 1280×720: bordes inferiores alineados con la barra súper y sin cruce con el temporizador.

## Idle del menú

- El panel TU LUCHADOR anima las celdas 0 y 1 de la primera fila del spritesheet 4×4 (las poses idle del formato actual).
- Duración: 466,7 ms por ciclo (aproximadamente 14 fotogramas de 60 Hz por celda).
- El encuadre del fotograma permanece cuadrado, sin estiramiento, y se adapta a la tarjeta.
- Si el usuario prefiere movimiento reducido, la imagen queda en la celda 0.

## Comprobaciones

`npm test` ejecuta la suite existente más `test:v18`; `npm run build:server-engine` compila el motor compartido.

No se han alterado IndexedDB, Supabase, salas online, retratos guardados ni sprites originales. No es necesario ejecutar SQL.
