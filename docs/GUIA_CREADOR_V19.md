# PHOTO BRAWL V19 — Asistente de creación

## Sin API key (opción predeterminada)

1. Abre **Crear con foto**. Sube una fotografía JPG/PNG/WEBP de una persona que quieras utilizar con permiso. Pon nombre si lo deseas.
2. Pulsa **1 · Copiar prompt de ficha**. Se abre el texto real que usa el juego para diseñar seis movimientos, estadísticas, arquetipo y pasiva.
3. Pulsa **Copiar prompt**, después **Gemini** o **ChatGPT**. Adjunta tu **foto original** en el chat y pega el prompt. La imagen **no se adjunta automáticamente** desde el juego a estos servicios.
4. Copia el JSON de respuesta (con o sin bloque Markdown). Regresa al juego, pulsa **3 · Pegar JSON y validar** y pega la respuesta. La validación rechaza mecánicas fuera del motor.
5. En **Sprites**, pulsa **Copiar prompt** y, en el mismo chat, solicita la imagen 4×4 con 16 celdas. Vuelve a adjuntar la foto si la IA ya no la tiene en contexto. Guarda la imagen y pulsa **Subir spritesheet**. **No copies la imagen desde el chat como texto**; descarga el archivo de imagen.
6. En **Retrato**, repite el proceso con su prompt. Descarga el retrato cuadrado y pulsa **Subir retrato**.
7. Revisa todo y pulsa **Guardar luchador**.

El asistente dispone de **¿Cómo se hace?** con cuatro pantallas cortas. El borrador conserva foto, JSON, spritesheet, retrato, modo de creación y paso actual en IndexedDB. No almacena una API key en el borrador.

### Con API key (alternativa)

En la primera pantalla pulsa **Tengo API key · Hacerlo automático**. Introduce una clave de Gemini y pulsa **Generar personaje completo**. Si falla alguna imagen, puedes copiar el prompt e importarla manualmente, sin repetir la ficha ni los recursos correctos.

**Seguridad:** el modo con API key usa la clave en el navegador, por lo que está pensado para pruebas personales. Antes de comercializar el juego, usa un backend autenticado, límites y cuotas; no distribuyas claves secretas a clientes.

## Comportamiento técnico y compatibilidad

- No cambia el formato de personajes ni sus estadísticas, habilidades o sprites.
- No cambia IndexedDB de versión ni migra o borra los personajes existentes. `CreatorDraft.mode` es opcional y los borradores antiguos se reabren en modo guiado.
- El juego no envía la foto original a Supabase ni a los proveedores de chat mediante este flujo manual: es el propio usuario quien la adjunta allí.
- Se conservan los prompts del motor actual, incluidos los seis ataques soportados, las animaciones de preparación/impacto, la celda de proyectil específica o KO y la estética pixel art.
- Las capacidades de generación de imágenes, cuotas y precios dependen de la cuenta del proveedor externo.
- Supabase, Render, combate online, PWA y ranking no cambian. Solo hay que actualizar Vercel.

## Pruebas

```
npm install
npm run build
npm run test:v19
npm run test:pwa
npm run test:creator
```

Para desarrollo móvil: `npm run dev -- --host 0.0.0.0`.
