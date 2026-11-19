# PHOTO BRAWL V48 — Presentaciones VS

## Objetivo

Introducciones breves y legibles, con identidad pixel art arcade, para **todos** los tipos de combate (1v1, CPU, versus local, Training/tutorial, 2v2, FFA, amistosas y clasificatorias online). Sin modificaciones de estadísticas, equilibrio, ELO ni física.

## Diseño elegido

- **1v1:** dos retratos originales, etiquetas P1/P2 y VS dorado central; se ven los nombres y la arena elegida.
- **2v2:** P1 + P3 a la izquierda en rojo y P2 + P4 a la derecha en azul, con VS central.
- **FFA:** cuatro retratos en una fila horizontal o cuadrícula 2×2 en vertical, colores distintos para cada puesto.
- **Estilo:** bordes cuadrados de dos píxeles, contornos arcade, fuente de títulos original, retratos `image-rendering: pixelated`, fondo con la imagen real de la arena atenuada. No se generan ni añaden imágenes externas.
- **Movimiento:** entrada en direcciones opuestas con frenado breve (sensación de choque), VS aparece después del impacto, pequeña pausa de lectura y salida suave.
- **Duración:** 90 fotogramas, aproximadamente **1,5 s a 60 fps**. Sin sonidos adicionales repetitivos.
- **Accesibilidad:** `prefers-reduced-motion` muestra una composición estática durante la fase previa.

## La cuenta atrás NO pierde tiempo

- `FightEngine` y `MultiFightEngine` exponen `versusIntroFrames` en el snapshot sincronizado.
- Los **90 primeros fotogramas** de cada nueva partida o revancha son una fase independiente del combate: no avanzan el reloj ni procesan entradas de lucha.
- Al terminar, la cuenta atrás de 2v2/FFA conserva **íntegros** sus 210 fotogramas originales: `3 → 2 → 1 → ¡YA!`.
- En 1v1 no se consume tiempo del reloj ni del mensaje de inicio/primera ronda.
- No se utiliza `setTimeout` para terminar las presentaciones. El efecto se calcula a partir del contador del motor, incluido el sincronizado desde Render, y por eso una conexión lenta o reconexión no adelanta el inicio.
- La puesta en marcha y las revanchas del servidor activan también esta fase.

## Despliegue

Aplicar el ZIP incremental sobre V47 respetando las rutas. Actualizar **Vercel y Render**. Incluye los ficheros compilados CommonJS del motor para el servidor. No requiere migración SQL.

## Verificaciones

- `npm run build:server-engine`
- `node --test tests/v48.versus-intros.test.cjs`
- `npm test`
- Probar en móvil vertical, horizontal y con cuatro jugadores: después del VS debe verse el **3 completo**, no saltar al 2.
- No es necesaria modificación de la sala ni de la estructura de personajes.
