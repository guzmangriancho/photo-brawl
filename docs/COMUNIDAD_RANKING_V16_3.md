# PHOTO BRAWL V16.3 — Comunidad, cuentas y ranking visibles

## Por qué antes no aparecían

La V16.2 contenía `AccountPanel.tsx` y consultas en `communityService.ts`, pero `CharacterSelect.tsx` nunca renderizaba el panel de cuenta, la galería pública ni el ranking real. El único ranking visible era un mockup obsoleto.

## Nuevo flujo

Desde Inicio hay cinco accesos compactos: Tutorial, Comunidad, Ranking, Cuenta y Ajustes. No se ha añadido ningún header y solo se puede empezar un combate desde Inicio.

- **Cuenta**: login por correo, nombre público, ELO, victorias/derrotas, copias de seguridad y estado de migración automática.
- **Comunidad → Explorar**: búsqueda y paginación de luchadores públicos, retratos, estadísticas y ataques, likes, ficha del creador.
- **Comunidad → Publicar**: lista de luchadores locales y botones para publicar u ocultar. La fotografía original NO se publica. Sin cuenta se muestra cómo iniciar sesión.
- **Ranking**: consulta perfiles y ELO almacenados en Supabase. No incluye usuarios de muestra ni victorias ficticias.
- **Versus Online**: opción Amistoso (sin ELO) y Clasificatorio. Los dos participantes deben tener cuenta Supabase. El servidor verifica ambos JWT y solamente registra el resultado cuando su propio motor confirma el final de un mejor de tres.

## Migración y privacidad

La migración automática privada de V16.2 sigue ejecutándose al arrancar. No se borra ni sobrescribe IndexedDB. Los luchadores se mantienen privados a menos que el usuario pulse expresamente Publicar y lo confirme.

Los datos de Supabase solo pueden verse desde la instalación donde estén configuradas `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (y estén aplicadas las tablas/RLS/Storage del SQL V16.2).

## Variables

**Vercel**:
- `VITE_SUPABASE_URL=https://<tu-ref>.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`
- `VITE_ONLINE_WS_URL=wss://photo-brawl-online.onrender.com/ws`

**Render** (nunca en el frontend ni variables `VITE_`):
- `SUPABASE_URL=https://<tu-ref>.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`
- `SUPABASE_SECRET_KEY=sb_secret_...`
- `ONLINE_ALLOWED_ORIGINS=https://<tu-dominio>.vercel.app`

Después de cambiar variables de Vercel, haz **Redeploy** para que entren en la compilación de Vite. En Render, el secreto únicamente se envía en la cabecera `apikey`; no en `Authorization` como si fuese JWT.

## Verificación manual

1. Publica el código de V16.3 en **el mismo dominio** donde tienes tus luchadores locales. No desinstales la PWA.
2. Comprueba **Cuenta → Mis copias** y espera el mensaje de migración.
3. Inicia sesión. En **Comunidad → Publicar**, pulsa Publicar en uno de tus personajes (consentimiento explícito).
4. Abre **Comunidad → Explorar** desde otra cuenta/dispositivo. Comprueba el retrato, los movimientos y los likes.
5. Abre **Ranking**. Si no hay partidas clasificatorias completas, aparecerá vacío (sin datos ficticios).
6. Con dos cuentas distintas, crea una sala **Clasificatorio** desde el anfitrión y únete con el invitado. Termina el mejor de tres. Comprueba `ranked_matches` y `player_profiles` en Supabase.
7. Las salas amistosas deben seguir funcionando sin cuenta y nunca generar resultados puntuables.

## Limitaciones importantes

La inscripción y la RPC de Supabase deben estar realmente configuradas. Las pruebas locales verifican la lógica y el protocolo, pero **no sustituyen la prueba end-to-end con tu proyecto Supabase**. Las partidas clasificatorias en salas privadas todavía son susceptibles a partidas pactadas, aunque la SQL limita a un resultado puntuable por pareja y 24 horas. La moderación de la comunidad, la denuncia de contenido y un emparejamiento competitivo público requieren futuras iteraciones.
