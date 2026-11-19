# PHOTO BRAWL V57 — DESPERTAR / ULTIMATE FORM

## Meta de diseño

Desbloqueo permanente por luchador al lograr **1.000 copas máximas** (`fighter_progress.best_trophies`) **o 15 victorias clasificatorias** (`fighter_progress.wins`). Se utiliza el máximo histórico para que una derrota posterior no retire la recompensa. Sólo se permite evolucionar a personajes **propios y sincronizados**.

Se ha seguido la idea de prestigio permanente y cosméticos por personaje de *Brawl Stars* (prestigio por luchador y reconocimiento visual), no su modelo de aumento de poder. Referencias, consultadas el 19/11/2026: [Prestige de Supercell](https://support.supercell.com/brawl-stars/en/articles/prestige.html), [notas febrero 2026](https://supercell.com/brawlstars/en/blog/release-notes/release-notes-february-2026/) y [documentación RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Balance

**No se añade +5 de estadísticas en ranked.** Tanto base como Ultimate cuentan **100 puntos enteros** en HP/SPD/PWR/TEC (15 a 35 por atributo). La forma Ultimate puede redistribuir puntos, pero conserva **el arquetipo, la pasiva, las seis mecánicas de ataque y el miembro atacante** para preservar la continuidad de animación y evitar poderes ocultos. Sí puede modificar nombres, descripciones, colores, efectos visuales, retrato y sprites.

Se ha evitado la transformación automática con 30 % de vida: introduciría cambios de estadísticas a mitad de combate que hoy no replica el protocolo online. La V57 permite **BASE / ULTIMATE**, elegible antes de entrar en combate, y reversible sin pérdida de datos. El contador de copas, el identificador del luchador y el ELO siguen vinculados a la misma forma base.

## Experiencia de usuario

En `ELEGIR LUCHADOR`, después de desbloquear el hito, la ficha elegida (no las tarjetas de lista ni la publicación) enseña el botón dorado `DESPERTAR`. Abre un modal compacto con cuatro pantallas:

1. **FICHA:** copiar prompt de evolución referenciado al JSON y retrato base, pegar JSON y validarlo estrictamente.
2. **RETRATO:** copiar prompt de retrato 512×512, adjuntar retrato base a la IA, subir la imagen generada y procesarla con `SpriteProcessor`.
3. **SPRITES:** copiar prompt para spritesheet 4×4 de 1024×1024, adjuntar sprites base y retrato Ultimate a la IA, subir la imagen generada, recortar fondo verde con `SpriteProcessor` (auras opacas sin halos verdes).
4. **GUARDAR:** previsualizar distribución de atributos y guardar imágenes y diseño en la nube.

El jugador alterna las formas con dos botones muy pequeños. Si reabre el Despertar, puede rehacer su Ultimate sin eliminar su forma base. El retrato Ultimate y la etiqueta aparecen en comunidad/explorar, ranking por luchador y presentación VS *si se ha publicado o si la forma está seleccionada en una partida*. La liga sigue mostrándose con el marco 16-bit. No se han añadido corazones a Publicar ni a la lista Mis luchadores.

## Almacenamiento y seguridad

Nueva tabla `public.fighter_ultimate_forms` (una Ultimate por personaje, clave `fighter_id`, propietario, diseño JSON y rutas de imágenes en Storage). Los originales se mantienen en `public.fighters` y en los buckets previos; no se sobrescriben. Almacenar una Ultimate sólo está permitido mediante la RPC `pb_save_ultimate_form`, función `SECURITY DEFINER` con usuario autenticado, propiedad del luchador, prueba de copas/victorias, reglas de balance y verificación de archivos en los buckets. **RLS** permite leerla a su dueño o públicamente sólo si el personaje y ambas imágenes están publicados. No se da permiso a clientes para insertar o modificar directamente la tabla.

El servidor Render comprueba en cada selección **ranked** la forma Ultimate guardada en Supabase (identificador, estadísticas y mecánicas). La marca que envía el navegador no sirve para desbloquearse una Ultimate arbitraria. Los modos amistosos/locales siguen la validación estándar de 100 puntos. En transferencias se elimina la Ultimate del dueño anterior; las copas no pasan de propietario con la lógica existente.

Al rehacer la Ultimate se generan rutas únicas para evitar cachés antiguas y se intenta limpiar arte anterior tras el guardado. Al retirar un luchador de Comunidad, se borran las referencias públicas y se solicita eliminar sus copias públicas. **Nota de privacidad:** los buckets de Supabase Storage `fighter-public` son públicos por diseño: cualquier URL pública compartida previamente podría persistir fuera de la aplicación (por ejemplo en una caché externa); no se puede revocar una descarga ya realizada. El contenido privado está en `fighter-private`.

## Instalación

1. Haz copia de seguridad de Supabase. Ejecuta `supabase/migrations/202611190004_v57_ultimate_awakenings.sql` en **Supabase SQL Editor**, después de V51/V53/V55/V56. También se entrega un SQL separado idéntico.
2. Actualiza **Render**: se han modificado `server/ranked.cjs`, `server/validation.cjs`, `server/rooms.cjs` y `server/group-rooms.cjs` para comprobar/sincronizar la forma seleccionada (también 2v2 y FFA).
3. Actualiza **Vercel** con el frontend V57 (package 1.12.0). Ejecuta localmente `npm ci && npm run build`.
4. Prueba en dos cuentas: la propia Ultimate, selección BASE/ULTIMATE, partida amistosa, clasificatoria real, difusión en Comunidad y pantalla VS. Prueba también la desconexión, una cuenta no propietaria, formulario alterado (105 puntos), transferencia y publicación/despublicación.

**No se ejecutó SQL sobre Supabase real ni se validó el juego en móviles físicos.** Debido a la imposibilidad de instalar todas las dependencias en este entorno, la compilación de Vite/TypeScript en producción requiere verificación por el usuario; pruebas automatizadas Node sí se ejecutaron.

## Archivos principales

- `src/services/ultimatePrompts.ts` — generador de prompts y validador estricto.
- `src/services/ultimateForms.ts` — persistencia, carga y distribución de arte.
- `src/components/UltimateWorkshop.tsx` y `ultimate.css` — asistente responsivo de estilo arcade.
- `src/components/CharacterSelect.tsx` — control BASE/ULTIMATE y Despertar.
- `src/components/CommunityPage.tsx`, `CommunityArtwork.tsx`, `VersusIntro.tsx` — presentaciones.
- `server/validation.cjs`, `server/ranked.cjs`, `server/rooms.cjs`, `server/group-rooms.cjs` — validación multijugador.
- `supabase/migrations/202611190004_v57_ultimate_awakenings.sql` — SQL transaccional de Supabase.
- `tests/v57.ultimate.test.cjs` — batería específica.
