# PHOTO BRAWL V16.4 — Renombrar luchadores

## Cómo se usa

1. Desde Inicio, entra en **ELEGIR LUCHADOR**.
2. Selecciona el luchador existente.
3. En su ficha pulsa **CAMBIAR NOMBRE** (junto a BORRAR).
4. Escribe el nuevo nombre (entre 1 y 20 caracteres) y confirma.

El cambio es inmediato en el menú, selección, combate y ficha. Los personajes de prueba del tutorial no se pueden modificar.

## Qué se conserva

- **ID del luchador**, que identifica a ese mismo personaje en los combates y en Supabase.
- Retrato, spritesheet, proyectiles, estadísticas, ataques, pasiva y fecha de creación.
- Banco de datos existente `PhotoBrawl16BitDB`/`custom_fighters`, sin cambiar su versión ni borrar registros.
- El estado público/privado del luchador en Supabase y sus recursos de Storage.

El nombre se guarda primero mediante una transacción de IndexedDB. Si hay sesión de Supabase, se actualiza **solo** `fighter_name` y el nombre en `fighter_data`, sin volver a subir imágenes. Si no hay sesión o la red falla, el nombre local permanece y la migración automática reintentará actualizar la nube al iniciar sesión o recuperar conexión.

Las ediciones se registran con `nameUpdatedAt` para que una copia de otro dispositivo con un nombre antiguo no sobrescriba un nombre más reciente. Al recuperar luchadores desde la nube, si el único cambio es el nombre, el sistema actualiza el registro local existente **sin crear un duplicado**. Los conflictos que afecten al arte o las estadísticas siguen preservándose como copias independientes.

## Despliegue

Este cambio solo afecta al frontend y a la gestión de personajes en Supabase existente. No requiere ejecutar nuevo SQL, ni modificar las variables de entorno, ni desplegar cambios en Render.

```bash
npm install
npm run build
npm run test:rename
git add .
git commit -m "V16.4 renombrar luchadores existentes"
git push origin main
```

Vercel desplegará automáticamente si el despliegue continuo está activado. La caché de la PWA se ha versionado para descargar el cambio. No desinstales la PWA ni borres los datos locales: pueden contener los personajes originales.

## Verificación automatizada

`tests/v16.rename-fighter.test.cjs` comprueba que el renombrado conserva arte, ID y estadísticas; rechaza nombres inválidos y luchadores del tutorial; actualiza un nombre más reciente al recuperar desde la nube; separa los conflictos reales; y renombra luchadores publicados sin volver a subir sus imágenes.

Las pruebas reales del flujo móvil y una sesión viva de Supabase deben comprobarse en el despliegue del usuario.
