# PHOTO BRAWL V29 · Galería privada de administrador

## Qué hace

Solo al iniciar sesión con la **cuenta de Supabase** que tenía el username `guzmangriancho` cuando se aplicó la migración SQL, aparecerá un interruptor en **INICIO → AJUSTES → VER TODOS LOS LUCHADORES**. El control está apagado al iniciar la sesión, y no se muestra al resto de usuarios.

- **Apagado:** COMUNIDAD → EXPLORAR funciona exactamente como antes; muestra solo luchadores publicados.
- **Encendido:** COMUNIDAD → EXPLORAR muestra todos los luchadores sincronizados en Supabase (publicados y privados), los etiqueta como `PÚBLICO` o `PRIVADO` y permite buscar por nombre, ver estadísticas, ataques, retrato y sprites. Es **solo lectura**: no cambia su publicación, propiedad ni colección personal.
- Desconectar/cambiar la cuenta apaga el interruptor y borra de la vista los resultados privados anteriores.
- **Solo aparecen personajes que están en `public.fighters`**. Un personaje que únicamente esté en el dispositivo de alguien y **no se haya sincronizado** no puede aparecer en una base de datos remota. Las fotos de origen nunca se guardan en esta tabla.

## Instalación obligatoria

1. Asegúrate de que la cuenta administradora ya está creada en Supabase, que su perfil tiene exactamente `username = 'guzmangriancho'` y que le pertenece a la persona prevista.
2. Abre Supabase → **SQL Editor** como propietario del proyecto y ejecuta el archivo completo `supabase/migrations/202611180003_admin_fighter_gallery.sql`. **Este paso es indispensable**: cambiar solo el frontend no da acceso a la galería privada.
3. Comprueba la asignación con esta consulta **solo en SQL Editor**:

   ```sql
   select p.username, a.user_id
   from photo_brawl_internal.admin_users a
   join public.player_profiles p on p.id = a.user_id;
   ```

   Debe devolver exactamente una fila para el ID de cuenta esperado. Si no hay filas, registra primero el usuario `guzmangriancho` y vuelve a ejecutar la migración. Si devuelve otra cuenta, **no uses el modo administrador**: verifica el ID con el propietario del proyecto antes de habilitarlo.
4. Despliega el frontend en Vercel, recarga y entra con esa cuenta. En Ajustes aparecerá el interruptor. Para mostrar el archivo, actívalo y ve a **COMUNIDAD → EXPLORAR**.

No es necesario actualizar el servidor de combates de Render. No es necesario borrar datos ni hacer migraciones destructivas.

## Seguridad

La autorización se decide en Postgres con `auth.uid()` (ID de Supabase) en `public.pb_is_admin()`. El username **solo se usa una vez al aplicar la migración** para elegir qué ID obtiene el rol. Cambiar el username después no concede el rol a otra cuenta. El rol vive en el esquema privado `photo_brawl_internal`, sin acceso desde clientes normales.

Las políticas de RLS conceden **SELECT** sobre luchadores privados y los archivos de `fighter-private` a esa única cuenta. No conceden INSERT, UPDATE ni DELETE ajenos, no convierten imágenes en públicas y no necesitan ni exponen la `service_role` o `SUPABASE_SECRET_KEY` en Vercel. Las imágenes privadas se descargan bajo autenticación en memoria del navegador; sus enlaces Blob se liberan al salir de cada vista.

Si alguien toma control de la cuenta de administrador, también tendrá el acceso de lectura. Utiliza una contraseña fuerte y las medidas de protección de acceso que ofrece Supabase.

## Comprobaciones locales

`npm run test:v29` verifica integración, políticas previstas, cuenta/rol y privacidad del frontend. `npm test` ejecuta también las comprobaciones existentes. Se necesita un proyecto Supabase real para verificar end-to-end los permisos de la base de datos y las descargas de imágenes privadas.
