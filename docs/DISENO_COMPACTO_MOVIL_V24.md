# PHOTO BRAWL V24 — Sala, resultados y creador en móvil

## Sala versus online

- La lista permanente de luchadores deja de mostrarse.
- **Toca tu retrato sobre tu nombre** para abrir el selector. Solo el jugador local puede cambiar su personaje. El recuadro del rival es informativo.
- El selector muestra hasta seis luchadores por página, con botones para avanzar y retroceder. Elegir otro personaje cierra el selector y mantiene el comportamiento previo de reinicio de «Estoy listo».
- Los cinco escenarios y AZAR están alineados en una fila de seis botones. El anfitrión puede cambiarlos cuando la sala espera; el invitado ve el seleccionado.
- El panel utiliza las unidades `dvh` y los márgenes `safe-area-inset-*` para evitar desplazamientos en móvil.

## Resultado del combate

- Marco cuadrado y tipografía pixelada, con colores de arcade.
- Se conservan ganador, marcador por rondas, escenario, ELO anterior/nuevo/variación para cada jugador en clasificatorias, estado de registro y botones de revancha o salida.
- El panel no utiliza scroll interno. La distribución se contrae con la altura disponible, incluida la vista apaisada.

## Creador de personajes

- En los pasos **SPRITES** y **RETRATO**, los botones **SUBIR IMAGEN** y **PEGAR IMAGEN** ocupan, cada uno, la mitad del ancho de la misma fila.
- PEGAR IMAGEN utiliza `navigator.clipboard.read()` cuando está disponible, elige una imagen PNG/JPG/WEBP y la pasa por el mismo procesamiento/validación que la subida de archivo.
- Si el navegador bloquea esa API, aparece un área de pegado manual compatible con un evento nativo `paste` (Ctrl+V o menú PEGAR). En móvil el acceso al portapapeles depende de los permisos del navegador.
- La ficha guiada emplea un resumen compacto de sus tres acciones en pantallas estrechas, sin perder los controles principales.

## Validación

- `npm test`: completo, correcto con el código V24 y las expectativas de versión del service worker actualizadas.
- Verificado que los estilos CSS se analizan sin errores.
- Se comprobó el ajuste geométrico del contenido con Chromium y maquetas representativas de las pantallas, en 320×568, 360×640, 390×844, 667×375 y 568×320, además de alturas reducidas. No se detectaron controles fuera de la vista ni desbordamiento interno en esas maquetas.
- **Pendiente de comprobación:** una compilación real con dependencias instaladas y uso en dispositivos físicos con la app y el backend conectados; el entorno de esta entrega no pudo finalizar `npm ci`.
