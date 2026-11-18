# PHOTO BRAWL V30 — Editor de luchadores propios

## Cómo usarlo

1. Entra en **Inicio → Elegir luchador**, selecciona uno que hayas creado y pulsa **EDITAR LUCHADOR**.
2. Modifica el nombre o, en los paneles **RETRATO** y **SPRITESHEET 4×4**, elige **SUBIR** o **PEGAR**. Puedes cambiar solo una imagen o ambas. En móvil, si el navegador restringe el portapapeles, se muestra un área editable para mantener pulsado y seleccionar **PEGAR**.
3. Comprueba las vistas previas; **NUEVO** identifica un recurso modificado. Pulsa **GUARDAR CAMBIOS** para actualizar el mismo luchador.

El retrato se centra y normaliza a 512×512. El spritesheet debe ser cuadrado, con 16 celdas y fondo verde cromático o transparente; se redimensiona a 1024×1024, se limpia el fondo y se alinean las poses mediante el mismo procesador del creador. PNG, JPG y WEBP son válidos al importar, hasta 15 MB por fichero. Los luchadores predeterminados del tutorial no se pueden editar.

## Conservación y sincronización

- El nombre, el retrato y/o los sprites se actualizan **en la misma fila IndexedDB** dentro de una transacción; no cambian ID, estadísticas, habilidades, ataques, fecha original ni condición de propiedad.
- `artUpdatedAt` y `nameUpdatedAt` (metadatos opcionales) indican cuándo se modificaron el arte y el nombre; la restauración de la nube fusiona por separado estas ediciones si la identidad y los datos de combate coinciden. Otros cambios de combate continúan tratándose como conflictos, sin sobrescribir luchadores.
- La sincronización sube imágenes privadas nuevas con rutas versionadas y **solo si el luchador ya estaba publicado** sube también la nueva versión al bucket público. Una actualización confirmada cambia los punteros y conserva `is_public`; una subida fallida conserva las imágenes anteriores y no elimina datos locales.
- La sincronización automática de respaldo detecta las ediciones de arte pendientes, además de las renombradas; requiere sesión autenticada en la misma cuenta vinculada a la colección local. Si el luchador todavía no está en la nube, se sube como copia privada al acceder a la cuenta.
- No se guardan imágenes originales de la fotografía de referencia, solo el nuevo retrato/spritesheet procesados.

## Despliegue

V30 modifica solo frontend, almacenamiento local y sincronización ya existente de Supabase: **sin SQL nuevo**, **sin protocolo online nuevo**. Actualiza Vercel y permite que la PWA recoja su nueva caché `pb-shell-v30-fighter-editor`. Render no requiere cambios. Para el archivo admin V29 sigue siendo necesaria su migración previa.

Para validar: `npm ci`, `npm test`, `npm run build` y prueba en un dispositivo móvil (especialmente el diálogo de pegado nativo de Safari/iOS), además de un luchador privado y otro publicado en Supabase.
