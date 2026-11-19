# V49 — Registro obligatorio y sincronización/recuperación al iniciar

## Entrada obligatoria

- En cada apertura, `usePlayerAccount` comprueba la identidad con `supabase.auth.getUser()`; no basta una sesión caducada almacenada en el navegador.
- Sin usuario autenticado, `App` muestra la ventana de `AccountPanel` en modo `requiredLogin`, con las opciones **ENTRAR** y **REGISTRARSE**. No puede cerrarse, ni accederse a menús, tutoriales o combates.
- Cuando ya hay una sesión verificada, el usuario no ve la ventana de acceso. Tampoco se vuelven a pedir credenciales innecesariamente.
- Si faltan las variables VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY, el juego queda bloqueado en el diálogo que informa de la configuración necesaria. Supabase es obligatorio para esta versión.

## Orden obligatorio en el inicio

1. **Validar sesión**: consultar al servidor de autenticación que es el usuario esperado.
2. **COMPROBAR SINCRONIZACIÓN**: ejecutar y **esperar** `runAutomaticMigrationNow`, que comprueba IndexedDB y respalda en Supabase los luchadores locales que faltan o los cambios pendientes. No se borra ninguna copia local. Se verifica la vinculación de la colección a la cuenta.
3. **RECUPERAR DE LA NUBE**: una vez terminada correctamente la sincronización, ejecutar `restoreCloudFightersReport` y fusionar las copias con `mergeCustomFighters` (sin reemplazar destructivamente los originales). Se esperan las descargas y la transacción local antes de entrar al juego.
4. **Mostrar el juego**: cargar la colección de IndexedDB actualizada. La pantalla de progreso distingue los pasos 1/2 y 2/2.

La secuencia se repite en cada carga/apertura de la aplicación o al iniciar sesión. También se ejecuta si ya había una sesión válida. Las dobles inicializaciones de React StrictMode comparten el mismo trabajo, evitando duplicados. Las copias de seguridad automáticas de nuevas creaciones y ediciones se mantienen durante el uso habitual del juego.

## Errores, compatibilidad y datos

- Si falla la autenticación/sincronización, el juego muestra el error con **REINTENTAR SINCRONIZACIÓN** y **CERRAR SESIÓN**, sin borrar los luchadores locales. No se recupera una colección de otra cuenta si la copia local está vinculada a un usuario diferente.
- Si falla la descarga de imágenes de algunos luchadores, se importan de forma no destructiva los que sí se pudieron descargar y se muestra una advertencia para reintentar manualmente desde **CUENTA → MIS COPIAS**.
- No se cambian ni el esquema ni la versión de IndexedDB, y no hay migraciones SQL adicionales.
- Se actualiza la caché PWA a `pb-shell-v36-required-login-cloud-startup` para distribuir el arranque nuevo a las aplicaciones instaladas.

## Verificación

- `node --test tests/v49.required-auth-startup.test.cjs`: obligación de autenticarse, orden real de las promesas, doble montaje, cambio de cuenta, errores y reapertura.
- `node --test tests/*.cjs`: conjunto completo de pruebas. El build final de Vite requiere instalar previamente las dependencias npm del `package-lock.json`.
