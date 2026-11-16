# PHOTO BRAWL V8 · Navegación de una sola pantalla

## Flujo de juego

```
INICIO ───────────────────────────────────> ¡JUGAR AHORA! ──> ARENA
  ├── ELEGIR LUCHADOR ──> CONFIRMAR ──────> INICIO
  │     ├── MOVIMIENTOS ──> VOLVER ──────> ELEGIR LUCHADOR
  │     └── CREAR CON FOTO (modal, opcional)
  ├── ELIGE UN MODO (4 opciones, sin cambiar de pantalla)
  ├── OPCIONES DE PARTIDA ──> GUARDAR ────> INICIO
  ├── RANKING (DEMO) ──> VOLVER ───────────> INICIO
  └── AJUSTES ──> VOLVER ──────────────────> INICIO
```

El botón de inicio de combate existe **solo** en `HOME`. En otras pantallas no se abre la arena y no hay accesos secundarios a `onStartMatch`.

## Diseño

- Sin header global, pestañas ni barra de navegación fija.
- En pantallas auxiliares aparece solamente un botón pequeño `VOLVER` en la esquina superior izquierda.
- Los cuatro modos se seleccionan directamente en Inicio, sin abrir submenús.
- Los botones de seleccionar luchador, opciones y jugar tienen jerarquía visual y separación propia.
- Todos los menús están diseñados para ocupar el viewport de la app (incluidas las safe areas); no hay scroll. Las plantillas grandes se dividen en páginas de seis personajes, sin lista desplazable.
- La disposición se reorganiza entre horizontal (dos columnas) y vertical (secciones apiladas dentro de la misma altura de viewport).
- Iconografía genérica, biseles de arcade 16-bit modernizado, paneles oscuros y tipografía pixel moderada.

## Información y restricciones

- Perfil, estadísticas y movimientos proceden de `FighterProfile`; no se inventan estadísticas.
- Ranking DEMO: nombres y retratos locales con ELO ficticio. Sin ranking online ni historial de combates.
- `1P_VS_CPU` y `CPU_VS_CPU`: se puede ajustar dificultad de CPU.
- `TRAINING`: la dificultad no es relevante; se muestra texto explicativo en su lugar.
- `1P_VS_2P`: juego local con teclado para ambos jugadores; la opción no indica erróneamente que haya control táctil para dos.
- Salto y doble salto del motor sin modificaciones: el segundo salto sigue estando disponible solo en quienes tienen el rasgo `DOUBLE_JUMP`.

## QA de esta entrega

Se verificó la navegación de las seis páginas en Chromium con prototipo renderizado desde `CharacterSelect.tsx` y `arcadeMenus.css`, para **320×650, 390×844, 667×375, 844×390 y 1024×576**. Se comprobó que el documento no desborda horizontal ni verticalmente y que solo Inicio contiene el botón de comenzar partida. Se revisó además la geometría de los controles en 320×568, 375×667, 568×320 y otros tamaños, incluyendo la ventana modal de creación.

`npm run test:engine`: 31 aserciones V5 correctas, incluyendo el doble salto dependiente del rasgo. Los 12 archivos TS/TSX pasaron revisión sintáctica mediante el transpilador de TypeScript.

La compilación integral de Vite no se ejecutó en este entorno porque npm no disponía de las dependencias en caché; requiere `npm install` en la máquina del desarrollador. Las pruebas de interfaz son una previsualización técnica, no equivalen a una prueba táctil en dispositivo físico.
