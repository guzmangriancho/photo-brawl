# V55 — Copas e historial versus

- El ranking de luchadores y dúos muestra número blanco con copa 16-bit en lugar de la insignia de liga; el marco del retrato conserva la liga.
- Los combates ranked 1v1, 2v2 y FFA ya pasaban los IDs locales al servidor con V51. La V55 almacena una instantánea fiable desde el evento de copas de la misma transacción, manteniendo el nombre original en el historial.
- La ficha pública de otro jugador enseña los últimos 50 enfrentamientos directos en los que participaste, con fecha, modo, resultado y ambos luchadores. En 2v2 excluye los partidos donde estabais en el mismo equipo.
- SQL 1: `PHOTO_BRAWL_V55_MIGRACION_HISTORIAL.sql` (también incluido en `supabase/migrations`).
- SQL 2 independiente: `PHOTO_BRAWL_V55_RELLENAR_PARTIDAS_ANTIGUAS.sql` (4 participaciones de 2 encuentros). Ejecutar después de SQL 1.
- No se modifica ni ELO ni copas con estas migraciones. Los combates antiguos cuyo luchador no está documentado aparecen como `?`, no inventamos los datos.
- Orden de despliegue: SQL 1, SQL 2, frontend Vercel. No se requiere cambiar Render si ejecuta V51+.
