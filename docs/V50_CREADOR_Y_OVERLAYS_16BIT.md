# PHOTO BRAWL V50 — Creador y overlays 16-bit

## Origen

Esta versión parte del **ZIP V49 con las dos correcciones de compilación TS18047**.
Mantiene el registro/inicio de sesión obligatorio y el arranque con validación de
sesión → sincronización → recuperación de la nube → acceso al juego. No modifica
la base de datos, el ELO ni las reglas del motor de combate.

## 1. Crear luchador sin pegado de imágenes

- En los pasos SPRITES y RETRATO se elimina el botón **PEGAR IMAGEN**, la
  lectura de imágenes del portapapeles y el cuadro alternativo de pegado nativo.
- Se conserva **SUBIR IMAGEN** con PNG, JPG y WEBP y validación/normalización
  mediante `processSpriteSheet` y `processPortrait`.
- Las instrucciones del asistente indican **descargar la imagen generada** antes
  de importarla desde un archivo.
- Se conserva la acción **PEGAR RESPUESTA** de texto de la IA (ficha JSON)
  y la acción **COPIAR PROMPT**. Los borradores siguen guardándose.
- **Editar luchador** (en `CharacterSelect.tsx`) es una función distinta; su
  pegado de imágenes no se ha cambiado.

## 2. Cuenta atrás y K.O. de cuatro jugadores

- En `GroupFightArena.tsx`, el contador proveniente de `MultiFightEngine`
  conserva su cronología real **3 → 2 → 1 → YA** y bloqueo de inputs. En pantalla
  se muestra **RONDA 1 · 3 → RONDA 1 · 2 → RONDA 1 · 1 → ¡FIGHT!**.
- La cuenta atrás utiliza el mismo `arena-announcement` del combate 1 VS 1.
  Se elimina la tipografía y los efectos particulares de la antigua cuenta atrás
  de cuatro participantes. La transición sigue usando una animación escalonada.
- El K.O. de 2 VS 2 y FFA conserva su información «P1–P4 / -1 VIDA / ELIMINADO»,
  pero comparte con 1 VS 1 el estilo de la letra K.O. (colores, tipografía y
  sombra de píxel). Se conserva el estallido de píxeles tras el golpe.
- El aviso de victoria usa ahora la clase `arena-victory-moment` y
  `arena-win-second` del combate 1 VS 1, con textos y resultados propios de cada
  modo. El empate muestra «FIN DEL COMBATE» y no anuncia victoria.

## 3. Auditoría de estilo transversal

- Se corrige la ausencia de la familia **Press Start 2P** en `index.html`.
  Antes, varios estilos declaraban esa fuente sin cargarla y el navegador
  sustituía la tipografía por su fallback monoespaciado.
- Los dígitos de 2 VS 2 en los menús y el HUD dejan de usar Arial: se emplea
  **Pixelify Sans** con números tabulares para conservar legibilidad y estética.
- Los demás menús, tarjetas y paneles ya usan principalmente Pixelify Sans,
  Oxanium, marcos angulares y sombras de píxel; se evitan retoques globales que
  puedan afectar a la legibilidad móvil.
- Se versiona la caché PWA como `pb-shell-v50-arcade-overlay-style`.
- Las fuentes Google se descargan cuando hay conexión; no se ha añadido un
  archivo de fuente local. Una auditoría de CSS no sustituye una revisión visual
  de pantallas renderizadas en cada dispositivo.

## Comprobaciones

- `node --test tests/v50.visual-unification.test.cjs` cubre importación de
  archivos, mantenimiento de pegado JSON, panel común de cuenta atrás, K.O.,
  victoria, carga de fuente, numerales y sintaxis de TSX.
- `node --test tests/*.cjs` ejecuta también los tests previos, incluido V49.
- `npm ci && npm run build` en el equipo de desarrollo para validar Vite y
  TypeScript con todas las dependencias reales de la instalación.

**Despliegue:** solo frontend Vercel; sin cambios en Render ni SQL.
