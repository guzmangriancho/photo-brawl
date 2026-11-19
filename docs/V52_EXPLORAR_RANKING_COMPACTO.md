# PHOTO BRAWL V52 — Galería y ranking 16-bit compactos

- **Explorar:** seis luchadores por página. En móvil vertical se muestran en dos columnas y tres filas; el contenido de la galería se desplaza dentro de la pantalla si no caben las tres filas completas. El retrato se presenta en un marco cuadrado y el nombre en una franja independiente que admite varias líneas, sin superposiciones.
- **Marcos de liga:** desaparece la etiqueta de esquina con inicial (B, P, O, etc.). Siguen existiendo las seis paletas y los detalles pixelados del marco en comunidad, selección, VS y ranking.
- **Ranking:** se eliminan la leyenda fija de copas inferior y los textos de explicación. En su lugar, botón **LIGAS** con ventana emergente y los seis rangos en copas según `LEAGUES` (sin cambiar los umbrales V51).
- **Móvil apaisado:** filas de ranking de tamaño fijo con desplazamiento interior para evitar que la leyenda o la lista de resultados deformen la página.
- **PWA:** caché del shell versionada como V52.

## Despliegue

Solo se modifica el **frontend**: publica V52 en **Vercel**. No hace falta cambiar Render ni ejecutar migraciones Supabase nuevas. **La migración SQL V51 sigue siendo necesaria** si todavía no está aplicada.

## Pruebas

`npm run test:v52` y `npm test`. La compilación `npm run build` necesita instalar todas las dependencias (`npm ci`). Comprueba en dispositivo real la galería vertical (ancho aproximado 360–430 px) y el ranking horizontal (altura aproximada 350–450 px).
