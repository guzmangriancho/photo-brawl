# PHOTO BRAWL V19.6 · Cuentas tradicionales con contraseña

## Objetivo

Sin Google ni Magic Links como método principal: registro y acceso con correo y contraseña mediante **Supabase Auth**. Supabase gestiona el hash de la contraseña y emite las sesiones/JWT que ya reconoce Render. No se han creado tablas nuevas ni una base de usuarios paralela.

## Configurar Supabase (obligatorio para no enviar correos)

1. Supabase Dashboard → proyecto PHOTO BRAWL → **Authentication** → **Sign In / Providers** (también puede aparecer como **Providers**) → **Email**.
2. Mantén **Enable Email provider** y **Allow new users to sign up** activados.
3. **Desactiva Confirm Email** y guarda. No hace falta tocar el SMTP.
4. Mantén `VITE_SUPABASE_URL` como `https://<proyecto>.supabase.co` y `VITE_SUPABASE_PUBLISHABLE_KEY` en Vercel. **No pongas la secret key en Vercel**.
5. Publica el código de V19.6 en Vercel. No es necesario editar Render ni ejecutar SQL.

**Advertencia de seguridad:** desactivar Confirm Email implica que cualquiera podría registrar una dirección que no controla y Supabase la marcaría como confirmada. Esto **no es adecuado para un lanzamiento público**. Antes de abrir el registro de forma masiva, configura email saliente con SMTP y vuelve a activar la verificación. Los límites de acceso por IP siguen existiendo; se elimina únicamente la dependencia del envío de correos de confirmación al registrar.

## Cuentas anteriores (creadas con enlace mágico)

**No crees una segunda cuenta con el mismo correo.** Si todavía estás dentro de esa cuenta en la PWA, entra en **CUENTA → CONTRASEÑA** y establece una contraseña antes de cerrar sesión. Se conserva el mismo ID de Supabase, el ELO, la comunidad y los luchadores que ya tuviera sincronizados. Si la sesión antigua ya caducó y no tiene contraseña, necesitarás recuperar el acceso por un método autorizado (por ejemplo, correo de recuperación cuando tengas SMTP configurado). No se puede recuperar una contraseña desconocida desde el cliente.

## Comportamiento

- Registro: correo + contraseña + repetir contraseña; sin correo de confirmación cuando `Confirm Email` está deshabilitado.
- Acceso: correo y contraseña.
- Cuenta activa: cambiar/establecer contraseña; editar nombre público; copias; cerrar sesión.
- Migración automática de luchadores: se mantiene, sin tocar IndexedDB. Nunca elimina los datos locales; protege la vinculación frente a iniciar sesión en una cuenta distinta en el mismo dispositivo.
- Clasificatorias: siguen utilizando el JWT del mismo Supabase Auth, sin cambios en el servidor.

## Limitaciones

- Con esta configuración, la recuperación de contraseña por correo seguirá necesitando un servicio de envío de emails; avisa a los usuarios que guarden su contraseña.
- El formulario usa **correo** como identificador. Para utilizar solo **apodo y contraseña**, sin correo en absoluto, necesitaríamos diseñar una autenticación propia segura en el backend y adaptar la integración con RLS; no conviene sustituir el correo por un alias inventado.
- No se han verificado registros contra tu proyecto real de Supabase: prueba con una cuenta nueva de test y una cuenta antigua todavía autenticada.

## Comprobación

1. En ventana privada, registra una cuenta nueva de pruebas.
2. Comprueba que puedes entrar **sin recibir ningún email**.
3. Cierra sesión y entra con esa contraseña.
4. Verifica que perfil, ranking y comunidad funcionan, y que la colección local sigue intacta.
5. En un dispositivo con cuenta antigua aún abierta, configura su contraseña y prueba el nuevo acceso **solo después de comprobar que la contraseña se guardó**.
