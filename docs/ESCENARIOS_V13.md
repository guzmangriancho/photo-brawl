# PHOTO BRAWL V13 · Fondos integrados

Se han instalado las seis ilustraciones proporcionadas por el usuario en `public/backgrounds/`.

- Menú: `menu.jpg` (todos los submenús mantienen la misma identidad).
- `SKI_RESORT` → `snow.jpg`.
- `NIGHT_PLAZA` → `neon.jpg`.
- `SUMMER_SUMMIT` → `beach.jpg` (ID histórico conservado para compatibilidad online).
- `TEMPLE_SUNSET` → `asia.jpg`.
- `INDUSTRIAL_ROOFTOP` → `rooftop.jpg`.

Las cinco arenas se eligen en **Inicio → Opciones de partida**, o desde la sala online si eres anfitrión. La imagen elegida se dibuja directamente en el canvas del combate (con arena, luchadores y HUD por encima). La simulación física, coordenadas de los luchadores y comportamiento del suelo no se han alterado. El servidor online valida también los dos IDs nuevos.

Nota: el fondo se adapta a 960 × 540 desde la imagen original con mínima diferencia de aspecto. Se muestra el fondo procedural anterior mientras carga y si falla la descarga. La pantalla principal utiliza `cover` para responder a distintas relaciones de aspecto.

Para desplegar: `npm install`, `npm run build`, `git add .`, `git commit -m "Add illustrated stages"` y `git push origin main`. Vercel y Render requieren la misma versión para que los escenarios nuevos funcionen online.
