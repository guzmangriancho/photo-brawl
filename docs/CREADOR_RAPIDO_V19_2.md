# PHOTO BRAWL V19.2 — creador de un toque

## Cambios de interacción

- **Copiar prompt:** copia el texto completo inmediatamente, sin mostrarlo; el botón confirma `¡COPIADO!`. Se aplica a ficha, spritesheet y retrato.
- **Portapapeles bloqueado:** únicamente en ese caso se abre un diálogo con el prompt para copiarlo manualmente. Esto puede ocurrir en páginas HTTP desde un móvil o si se deniegan permisos.
- **Pegar respuesta:** intenta leer el portapapeles desde el botón y **valida inmediatamente** con el validador del motor. Si es válido, pasa a la pantalla SPRITES, sin un botón «Validar» adicional.
- **Safari/iOS:** si el sistema no permite leer el portapapeles directamente, abre una caja que **valida en el momento en que se pega el texto**. Si la ficha no es válida, conserva lo pegado y explica el error.
- **Abrir mi IA:** ocupa la misma anchura y altura que los botones de copiar y pegar; Gemini y ChatGPT aparecen en una lista flotante que no mueve el formulario.
- Se conservan los borradores y la generación automática mediante API key. **No se modifica ningún personaje existente**.

## Prueba rápida

1. Ve a «CREAR CON FOTO» → modo guiado → COPIAR PROMPT: comprueba que el texto del botón pasa a `¡COPIADO!` sin abrir ningún modal.
2. Abre Gemini o ChatGPT, pega prompt y adjunta una foto original allí, copia la respuesta completa.
3. Vuelve a PHOTO BRAWL → PEGAR RESPUESTA. Si el navegador lo permite, el juego valida y avanza automáticamente. En iPhone puede pedir pegar manualmente en el campo de respaldo.
4. Repite el botón de copia para SPRITES y RETRATO: también deben confirmar `¡COPIADO!` sin mostrar prompts.
5. Despliega ABRIR MI IA: el tamaño del botón debe ser idéntico al de los otros dos y la lista no debe empujar otros botones.

## Publicación

Actualiza **Vercel**; no hay cambios en Supabase ni Render. La caché de la PWA usa `pb-shell-v19-2-quick-clipboard`.
No borres datos del navegador ni reinstales la PWA durante la actualización: podrían quedar luchadores solo en almacenamiento local.
