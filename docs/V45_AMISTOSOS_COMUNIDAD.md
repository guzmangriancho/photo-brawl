# PHOTO BRAWL V45 — Luchadores publicados en amistosas

Parche incremental sobre V44. Extrae el ZIP conservando las rutas y sustituyendo los archivos indicados.

## Amistosos online (1v1, 2v2, Free For All)
- Toca el retrato del luchador al preparar o crear una sala. Elige **MIS LUCHADORES** o **COMUNIDAD**.
- En COMUNIDAD puedes buscar y paginar por luchadores publicados en Supabase. Al elegir uno, se descargan su retrato y sus sprites públicos para el combate. No se importa a tu colección ni se modifica su propiedad.
- Puedes seleccionar un luchador publicado incluso aunque todavía no tengas ninguno propio.
- En el resultado de una partida amistosa online, puedes cambiar a otro luchador público antes de pedir revancha.

## Clasificatorias
- Solo los luchadores guardados en tu colección, con tu sesión iniciada, son seleccionables; no aparece la pestaña COMUNIDAD.
- El servidor de Render verifica que el `local_id` pertenece al `owner_id` autenticado de Supabase y que sus estadísticas, arquetipo y tipos de ataque coinciden con los metadatos guardados. La comprobación se realiza al crear sala, unirse, cambiar luchador y solicitar revancha.
- Si un luchador nuevo aún no está subido, el frontend intenta guardarlo **privadamente** en la nube antes de empezar. El servidor rechaza una selección que no haya podido verificarse.
- No se han modificado las reglas de KO, los cálculos de ELO ni la clasificación.

## Despliegue
1. Extrae el parche sobre la carpeta del proyecto V44.
2. Comprueba `npm run build` en tu instalación local.
3. Actualiza **Vercel** (frontend) y **Render** (servidor online). Deben usar la misma versión.
4. No se requiere nueva migración de Supabase. Es necesario que ya funcionen las tablas y los buckets públicos/privados de versiones anteriores.

Pruebas en este entorno: `node --test tests/*.test.cjs` (192 aprobadas), y `node --check` para los archivos de servidor modificados. No se pudo completar `npm run build` aquí porque faltan dependencias del frontend en este entorno. La conexión real contra Supabase, las cargas de imágenes y las pruebas con varios dispositivos están pendientes.
