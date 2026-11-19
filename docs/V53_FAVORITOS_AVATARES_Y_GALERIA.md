# PHOTO BRAWL V53 — Favoritos, perfiles y galería

## Cambios visibles

- **Explorar:** seis luchadores en pantalla (2 columnas × 3 filas) en móvil vertical. La galería tiene un espacio fijo y no necesita scroll; los retratos se reducen con la altura disponible y los nombres se dibujan fuera de la imagen en hasta dos líneas.
- **Ranking:** los tres botones de modos tienen un tamaño de letra comparable al de **LIGAS**. El botón **DÚOS** es más corto; la clasificación por pareja y su sistema de copas no cambian.
- **Publicar:** la imagen ocupa un cuadro 1:1 centrado y recortado sin deformaciones. Un corazón independiente en su esquina superior derecha permite marcar el favorito.
- **Mis luchadores:** corazón en la colección, ficha del luchador seleccionado y ficha de movimientos. Corazón rosa relleno = favorito. Se puede cambiar o quitar.
- **Identidad visual:** el retrato favorito pasa a ser el avatar en el menú principal, Mi cuenta, botón de cuenta de Comunidad, ranking ELO, dúos y perfil público. Si no hay favorito se utiliza el icono de jugador.
- Los retratos y los corazones respetan el marco 16-bit de PHOTO BRAWL.

## Privacidad

Al marcar el luchador, se solicita confirmación: **únicamente el retrato se hace visible como avatar público**. No publica el luchador, su spritesheet, sus estadísticas ni su ficha. El retrato se guarda como objeto público independiente en `fighter-public/<uid>/avatars/<uuid>.<ext>`; por eso no desaparece si el luchador pasa a privado en Comunidad.

El favorito es único por **cuenta de Supabase**, no por dispositivo. El ID del luchador se resuelve a su versión privada en la nube. Un luchador nuevo todavía sin copia se guarda primero en el almacenamiento privado y después se puede seleccionar. La migración valida que el luchador pertenece realmente a la cuenta y que el avatar tiene una ruta propia válida. El usuario solo puede actualizar las dos nuevas columnas de su perfil; el rating y los resultados siguen protegidos.

Al quitar el favorito se borra su referencia y se intenta borrar el avatar público anterior; si falla la eliminación del archivo, la referencia ya no se anuncia como avatar. Al eliminar o transferir el luchador, un trigger SQL limpia su asociación. El borrado de objetos huérfanos tras acciones de otro dispositivo no es automático.

## Migración e instalación (obligatorio en este orden)

1. Asegúrate de tener aplicada la migración V51 `202611190001_progression_leagues_duos.sql` y todas las anteriores.
2. En Supabase → SQL Editor ejecuta `supabase/migrations/202611190002_favorite_fighter_profile.sql` o el archivo independiente `PHOTO_BRAWL_V53_MIGRACION_SUPABASE.sql`.
3. Despliega el frontend **V53 en Vercel**. No hay cambios en Render para esta versión.
4. Comprueba los corazones y los avatares con dos cuentas distintas: uno de los luchadores debe permanecer privado; tras cambiar el favorito, la imagen pública debe cambiar también en el ranking. Prueba también desmarcar, eliminar y transferir un luchador.

No se modifican tablas de resultados ni se reinician ELO, copas, ligas o colecciones. Las columnas son adicionales y su valor predeterminado es `NULL`.

## Pruebas disponibles

- `npm run test:v53` (selección, limpieza ante errores, URL segura, SQL, galerías y sintaxis TSX).
- `npm run test:v52`, `npm run test:v51` y `npm run test:v15` para regresiones de diseño/progresión.
- `npm ci && npm run build` en el entorno de despliegue con todas las dependencias.

La validación visual real en teléfonos y la ejecución de la migración en Supabase del propietario quedan pendientes. En el entorno de empaquetado no hay instalación completa de dependencias del frontend y `npm run build` no puede finalizar por errores de tipos ausentes en `node_modules`.
