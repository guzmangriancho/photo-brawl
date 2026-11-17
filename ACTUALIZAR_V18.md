# Actualizar PHOTO BRAWL a V18

1. Haz una copia de seguridad de tu código. **No borres los datos de la PWA**, ya que contienen los luchadores locales.
2. Descomprime el ZIP completo sobre la raíz del proyecto o copia únicamente el contenido del parche preservando las carpetas.
3. Ejecuta `npm install`, `npm run build` y, opcionalmente, `npm test`.
4. Publica: `git add . && git commit -m "V18 sombras retratos e idle" && git push origin main`.
5. Vercel actualizará los archivos visuales. Render puede redeplegarse automáticamente con el mismo commit; **no hace falta cambiar sus variables ni el esquema de Supabase**.
6. Si la PWA muestra caché antigua, cierra y vuelve a abrir la app (sin desinstalar ni borrar almacenamiento).

Los cambios principales están en `src/engine/FightEngine.ts`, `src/components/FightArena.tsx`, `src/components/fightArena.css`, `src/components/CharacterSelect.tsx`, `src/components/arcadeMenus.css` y `public/sw.js`.

Pruebas de V18: `npm run test:v18`.
