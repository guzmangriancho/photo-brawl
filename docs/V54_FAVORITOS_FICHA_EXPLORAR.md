# PHOTO BRAWL V54 — Favorito y ficha de Explorar

- La selección de favorito se realiza **solo** desde la ficha de **Luchador elegido** de «Mis luchadores», mediante un corazón en la esquina superior derecha del panel, fuera de la imagen.
- Sin corazón en las miniaturas de «Mis luchadores», la ficha «Movimientos» ni en las tarjetas de «Publicar» de la comunidad. La posibilidad de ver el avatar favorito en cuentas y clasificaciones se conserva.
- Al consultar una ficha desde «Explorar», el retrato ocupa el interior del marco de liga sin recorte por `object-fit:cover`; ahora usa `contain` y mantiene íntegra la imagen cargada.
- En apaisado con altura limitada, el panel usa dos columnas: retrato y datos a la izquierda, movimientos a la derecha. El contenido tiene desplazamiento **interno** para pantallas especialmente reducidas.
- Se cambia la versión de caché PWA para instalar los nuevos estilos al actualizar la app.

## Despliegue

Solo frontend (Vercel). No hay cambios de base de datos, ni SQL ni ajustes para Render. Mantener las migraciones de V51 y V53 aplicadas.

## Verificación

27 pruebas específicas de V50 a V54 pasan. No se ha podido ejecutar compilación Vite completa en este entorno por dependencias de `node_modules` incompletas. Ejecuta `npm ci && npm run build` antes del despliegue y verifica visualmente en móvil vertical/horizontal.
