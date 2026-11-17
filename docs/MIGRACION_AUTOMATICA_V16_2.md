# PHOTO BRAWL V16.2 — Migración automática y SQL corregido

## 1. Corregir la base de datos Supabase

La consulta anterior falló en la línea 57 de la definición de `public.fighters`: faltaba un `)` para cerrar el `check` de `public_asset_ownership` antes del paréntesis que cierra la tabla.

- Abre **Supabase → SQL Editor → New query**.
- Copia el archivo **completo** `supabase/migrations/202611170001_photo_brawl_community.sql` (o el archivo descargable separado `photo-brawl-v16-2-supabase-corregido.sql`).
- Pulsa **Run**. El SQL es reejecutable: `create table if not exists`, `create or replace function`, `drop policy if exists` / `create policy` y buckets con `on conflict`.
- No hace `drop table` ni vacía registros. Si el intento anterior ejecutó algunas sentencias antes del error, puedes ejecutar el script corregido completo; no añadas la versión antigua antes de él.
- Comprueba en Table Editor las tablas `player_profiles`, `fighters`, `fighter_likes` y `ranked_matches` y en Storage los buckets `fighter-private` (privado) y `fighter-public` (público únicamente por acción expresa del usuario).
- Si al ejecutar el SQL aparece un nuevo error, guarda el mensaje exacto: este proyecto NO se ha ejecutado contra tu instancia real de Supabase.

## 2. Actualizar el proyecto

Sube V16.2 al **mismo dominio de producción de Vercel** que almacenaba los personajes. Configura `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y conserva `VITE_ONLINE_WS_URL`. Si la cuenta estaba activa anteriormente, Vite detectará la sesión; si no, entra por `Ajustes → Mi cuenta` con correo. Render no requiere cambios para esta migración local.

## 3. Comportamiento automático

- Al arrancar se consulta la sesión de Supabase; no hay que pulsar ningún botón para migrar.
- **Sin cuenta:** los luchadores siguen utilizables en IndexedDB y la copia se hace automáticamente después de entrar.
- **Con cuenta:** se leen todos los luchadores locales no tutoriales y se suben como **registros privados con imágenes**, sin publicar ni revelar fotografías originales.
- Cuando terminas de crear o importar un luchador, se programa otra sincronización.
- Si se corta Internet, fallan las políticas o un archivo supera el tamaño permitido, los originales siguen intactos. Vuelve a la app en línea para que lo reintente, o pulsa `Reintentar copia privada` en `Mi cuenta → Mis copias`.
- No se borra, cambia de versión ni se recrea el almacén `custom_fighters`. La restauración manual desde nube siempre fusiona y nunca reemplaza.
- Por seguridad, la primera cuenta que recibe los luchadores locales queda vinculada a ese navegador. Si cambias a otra cuenta en el mismo navegador, se bloquea la subida automática de esa colección para impedir una filtración entre cuentas. Para trasladarla deliberadamente, utiliza Exportar/Importar JSON.

## 4. Verificación desde el móvil

1. Sin desinstalar la PWA, actualiza PHOTO BRAWL en la **misma URL** y comprueba que los luchadores siguen seleccionables.
2. Inicia sesión con Supabase y abre `Ajustes → Mi cuenta → Mis copias`: debe aparecer `SINCRONIZACIÓN AUTOMÁTICA` con el progreso y el número de personajes copiados o ya existentes.
3. Abre **Supabase → Table Editor → fighters** y comprueba las filas de tu usuario con `is_public=false`.
4. Comprueba el bucket `fighter-private` (debe contener el retrato y spritesheet bajo el ID del propietario). La fotografía original no se sube.
5. Para verificar la recuperación independiente, entra con la misma cuenta en otro dispositivo y usa `RECUPERAR DE LA NUBE` (la descarga completa aún se solicita manualmente).
6. Conserva una copia JSON de seguridad hasta verificar la nube. No borres datos ni desinstales la PWA antes de terminar.

## Limitaciones importantes

- No se pueden migrar automáticamente personajes de `localhost`, IP local, otra URL de Vercel, o una PWA instalada con otro contenedor de almacenamiento. Abre primero el origen antiguo y usa su exportación JSON.
- La sincronización a nube requiere una cuenta iniciada y Supabase configurado. La versión nunca afirma que los datos estén en la nube si hay errores; los errores aparecen en `Mis copias`.
- Los personajes de tutorial no se suben, y los luchadores guardados previamente en otra cuenta con el mismo ID nunca se sobreescriben durante la copia automática.
- La copia local persiste salvo borrado del usuario/sistema o falla de almacenamiento. Por seguridad también conviene exportar una copia JSON hasta comprobar el estado remoto.
- No hay integración real con Supabase probada desde este entorno, así que las políticas y el comportamiento de Storage deben verificarse con tu proyecto antes de considerar el despliegue totalmente validado.
