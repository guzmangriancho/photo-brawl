# Diseño de combate móvil — V5

## Principios

**Divertido al tocar, profundo al explorar:** dos botones de ataque (A y B), un control direccional y un salto propio, con variantes legibles. Un combo sencillo funciona desde el primer combate, pero conservar la altura del golpe, la distancia, la defensa y el uso de técnicas genera decisiones. Evitar controles que desencadenen gestos del navegador y evitar mandos visuales que oculten al rival.

## Referencias de diseño

- **Granblue Fantasy Versus: Rising**: el sistema Triple Attack permite repetir ataques para un combo accesible, y el uso de skills permite variedad. Fuente oficial: https://rising.granbluefantasy.jp/en/gamemodes/playguide_03
- **Street Fighter 6 (Modern Controls)**: botones contextuales y direcciones reducen la dificultad de ejecución sin eliminar posicionamiento. Manual oficial: https://game.capcom.com/manual/SF6/en/ps5/page/2/3
- **Skullgirls Mobile**: inspiración táctil para dash horizontal y cargas; **no** se replica salto por swipe vertical, porque molesta en navegador móvil. Referencia comunitaria: https://forum.skullgirlsmobile.com/threads/list-of-useful-acronyms.310/

Estos son principios de usabilidad, no una copia de los sistemas o contenidos de esos juegos.

## Decisiones concretas

1. **SALTO independiente** en esquina inferior derecha, encima de A y B, suficientemente ancho para tocar varias veces. El joystick permite seleccionar arriba+B, pero no saltar desde arriba.
2. **Habilidad por personaje intacta:** `DOUBLE_JUMP` = 2 saltos; cualquier otra pasiva = 1. `queueTouchJump()` almacena pulsaciones breves para que no se pierdan entre frames. No se concede una segunda acción aérea a quien no la tiene.
3. **A instantánea:** el primer golpe se dispara al bajar el dedo. Si el dedo sigue apoyado 270 ms se añade un HEAVY encadenable. Tras dos A confirmadas el tercer toque ejecuta remate instantáneo, sin esperar pulsación larga.
4. **Variaciones direccionales:** abajo+A = LOW; adelante+A = RUSH; B = técnica neutra/avance/antiaéreo. El tercer toque A puede ser un golpe bajo si el joystick está abajo. En teclado siguen existiendo botones de golpe fuerte y técnicas avanzadas.
5. **Gatling** y cancelaciones: LIGHT→LIGHT→HEAVY; LIGHT→LOW/HEAVY; RUSH→LIGHT; ataques normales→técnica; SUPER desde otros ataques con energía. Se confirma golpe/bloqueo para cancelar normales a técnica. Un buffer de 32 frames facilita el encadenamiento.
6. **HUD pixel art alta-media resolución:** tipografía Pixelify Sans, contornos de 1–3 px y botones casi cuadrados; canvas de arena y sprites no cambiados. Opacidad de los controles ajustable en pausa y persistente.
7. **Áreas seguras:** controles en zonas inferiores separadas y con Pointer Events para que puedan utilizarse con dos pulgares. El SUPER sigue oculto hasta cargarse. Las opciones y depuración permanecen en pausa.

## Recetas de combos a probar

- A → A → A → B para experimentar con remate y técnica.
- A → A → mantener A → B para descubrir un remate alternativo.
- Adelante + A → A → B para cerrar distancia.
- Abajo + A → B para presión baja.
- Joystick arriba + B para antiaéreo mientras el salto queda en botón separado.

## Verificación y playtest pendiente

Pruebas automatizadas de motor: **31 aserciones**, incluidas las habilidades de salto. QA visual estático con Chromium en cinco dimensiones de pantalla. No se ha probado aún en móviles físicos ni se puede garantizar que Safari o Chrome oculten todas las barras propias del navegador; sólo se puede impedir la interpretación habitual de gestos sobre controles.

Se recomienda probar con usuarios que no conocen el juego: ¿descubren A-A-A en 30 segundos? ¿distinguen B según dirección? ¿encuentran SALTO de inmediato? ¿consiguen dos saltos solo con el luchador correcto? ¿hay falsas entradas de dash? ¿entienden cómo cambiar transparencia y joysticks? Registrar cinco sesiones cortas y ajustar umbrales/tamaño sin añadir complejidad permanente.
