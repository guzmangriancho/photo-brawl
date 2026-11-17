# PHOTO BRAWL V15 · Primer luchador y estados vacíos

## Recorrido del jugador nuevo

Inicio, sin luchadores propios:

- Tarjeta izquierda: presentación corta y **una sola acción principal, CREAR CON FOTO**. Abre el creador directamente, sin visita a la selección vacía.
- Tarjeta derecha: los tres modos siguen visibles para explicar qué ofrece el juego. Se pueden preseleccionar, pero **Opciones de partida** y **Jugar** se sustituyen por una tarjeta informativa, no interactiva, hasta tener un luchador.
- El botón **Tutorial** sigue disponible para probar gratuitamente los cuatro personajes de demostración.
- Tras guardar el primer luchador, este queda seleccionado automáticamente y se vuelve a Inicio. Desde ahí se pueden configurar la partida y jugar.

## Recorrido del jugador con luchadores

Inicio → Elegir luchador → Ver ficha / movimientos → Confirmar → Inicio → Opciones de partida → Inicio → Jugar. La selección contiene un acceso secundario a crear otro luchador.

Si se elimina el último luchador mientras se está en la selección, se muestra una tarjeta vacía unificada con una sola acción de creación. No se dibuja una ficha de personaje inexistente ni un paginador sin elementos.

## Garantías técnicas

- La ruta a `PLAY` y `MOVES` se protege en la función de navegación y se abandona si desaparece el personaje seleccionado.
- La pantalla de opciones solo se dibuja cuando hay jugador y rival válidos.
- Una invitación online o un borrador de Gemini no se borran por este cambio; al reanudar el creador, la pantalla subyacente es Inicio.
- Se actualiza la caché del Service Worker (`pb-shell-v15-1`).

## Pruebas

`npm run test:v15` comprueba el árbol real de componentes React/JSX transpilado con dependencias simuladas, y prueba los eventos del menú en los estados sin luchador, selección de modos, apertura directa del creador, creación del primer personaje y eliminación del último. `npm test` conserva las pruebas existentes del motor, PWA, creador y online.

No se han modificado la mecánica de los luchadores, los escenarios, el backend WebSocket ni las salas online.
