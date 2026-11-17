# V16.1 — Conservar luchadores al activar Supabase

## Compatibilidad con las versiones anteriores

- La colección de **V15 y V16** utiliza **IndexedDB `PhotoBrawl16BitDB`, versión 2, almacén `custom_fighters`**. Estos nombres y versión se han mantenido sin cambios; no se ha añadido ninguna migración que borre el contenido.
- Los borradores de creación continúan en el mismo almacén `creator_drafts` y no se incluyen en exportaciones de luchadores. Termina un borrador antes de cambiar de dispositivo.
- Iniciar/cerrar sesión en Supabase **no borra ni reemplaza** personajes locales. Registrar una cuenta no activa una subida masiva automática.
- La reparación del chroma antigua ahora se aplica solo en memoria, sin sobrescribir el spritesheet original guardado en IndexedDB.
- Si el navegador deniega el acceso a IndexedDB, el juego muestra un error explícito en vez de una colección falsamente vacía.

## Antes de actualizar o cambiar de móvil

1. En **el mismo dispositivo, navegador y URL** que contiene tus luchadores, abre **AJUSTES → MI CUENTA / SINCRONIZAR → MIS COPIAS**.
2. Pulsa **EXPORTAR ARCHIVO**; guarda el JSON en Archivos/Drive/iCloud/PC. Incluye fichas, estadísticas, movimientos, spritesheets y retratos generados. No contiene la foto original ni la clave Gemini.
3. **Comprueba que el archivo existe y pesa más que unos pocos bytes** antes de borrar nada o reinstalar la PWA.
4. Si has iniciado sesión, pulsa **GUARDAR TODOS EN LA NUBE** para crear copias privadas. El proceso no publica luchadores y omite los que ya están asociados a esa cuenta; revisa si indica fallos parciales.
5. En otro dispositivo, entra con la misma cuenta y pulsa **RECUPERAR DE LA NUBE**, o ve a MIS COPIAS → **IMPORTAR ARCHIVO** para usar tu JSON.

**MUY IMPORTANTE:** `localhost`, una IP `192.168.x.x`, el dominio de Vercel, los dominios de previews de Vercel y una PWA de iPhone pueden tener almacenes diferentes. No existe una migración automática entre orígenes distintos: usa la exportación o la copia privada en Supabase. No desinstales la PWA o borres los datos de la web antes de confirmar la copia.

## Conflictos, errores y seguridad

- Importar un JSON o recuperar desde Supabase **fusiona, nunca sustituye**. Si el ID no existe se añade. Si ya existe y el contenido es idéntico se omite. Si comparte ID pero cambia un movimiento, estadística o dibujo, la copia entrante recibe un **ID nuevo** y ambos luchadores siguen disponibles.
- La fusión se hace en **una transacción IndexedDB**. Si no puede guardar (cuota, permisos), no se borran los personajes que ya estaban; se muestra un error.
- Los archivos de copia se comprueban antes de escribir. Solo se importan copias de PHOTO BRAWL con ilustraciones y movimientos completos.
- Una descarga de Supabase que falla se informa, en lugar de descartarse silenciosamente.
- La copia privada en la nube es voluntaria; no se publica nada en la comunidad sin pulsar PUBLICAR en la ficha.
- Los archivos JSON contienen imágenes generadas y datos del personaje, por lo que debes guardarlos de forma privada si el personaje es personal.

## Comprobación rápida

- Instala la V16.1 **en la misma URL de producción** de Vercel que ya usabas.
- Comprueba que puedes seleccionar tus luchadores antiguos antes y después de iniciar sesión.
- Exporta un JSON, impórtalo sobre la misma colección: debe indicar **0 añadidos**, N ya presentes y sin duplicados.
- Entra con la misma cuenta en otro dispositivo, recupera la colección y comprueba que aparecen los retratos, sprites y ataques.
- `node --test tests/v16.local-preservation.test.cjs` valida lectura de la colección heredada, exportación, conflictos de ID y rechazo de ficheros corruptos.

## Límites conocidos

- Ningún navegador garantiza persistencia absoluta de su almacenamiento local: el usuario puede borrarlo, quedarse sin espacio o utilizar navegación privada. La **exportación descargada** o una copia **privada en Supabase confirmada** son la protección para esos casos.
- Una foto original o un borrador todavía incompleto no se recuperan automáticamente desde la exportación de luchadores. La foto original permanece fuera de Supabase por privacidad.
