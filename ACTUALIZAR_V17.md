# PHOTO BRAWL V17 — EFECTOS ARCADE

## Instalación

**Proyecto completo:** descomprime el ZIP y utiliza esta versión para sustituir
los archivos de tu proyecto (conserva tus variables de entorno locales).

**Parche:** copia los archivos del parche en tu proyecto actual V16.4 conservando
exactamente la estructura de carpetas.

Desde el directorio que contiene `package.json`:

```sh
npm install
npm run build
npm test
```

Despliegue:

```sh
git add .
git commit -m "V17 efectos de combate arcade"
git push origin main
```

Actualiza **Vercel y Render**: el servidor también compila la nueva versión de
`FightEngine` y su dependencia `ArcadeVFX`. No hace falta modificar SQL, claves
de Supabase, tablas, sprites ni colección local.

Tras actualizar el despliegue, cierra y vuelve a abrir la PWA para renovar su
caché. No desinstales la PWA ni borres los datos del sitio: los luchadores
creados están guardados localmente y/o sincronizados en la nube.

## Pruebas

- `npm run test:vfx`: 17 verificaciones de VFX, incluyendo ausencia de
  rectángulos en ataques y guardias, no mutación del estado y variedad de
  efectos de supers y proyectiles.
- `npm test`: suite completa de motor, creador, PWA, online, Supabase y VFX.
- `npm run build`: compilación de producción; requiere las dependencias npm.

## Notas

Los rectángulos para **hitboxes de depuración** se conservan deliberadamente,
porque son útiles en el laboratorio. Solo se han sustituido los efectos gráficos
visibles durante el combate normal. No se cambian daños ni físicas.

Consulta `docs/EFECTOS_DE_COMBATE_V17.md` para detalles del motor.
