# PHOTO BRAWL V19.1 — Primer paso del creador simplificado

## Sin clave Gemini (predeterminado)

1. Escribe un nombre si quieres. No es obligatorio.
2. Pulsa **1 · COPIAR PROMPT**. Se abre un panel con el prompt; en navegadores compatibles se copia automáticamente. Si el navegador bloquea el portapapeles, utiliza el botón **COPIAR PROMPT** del panel.
3. Pulsa **2 · ABRIR MI IA** y elige Gemini o ChatGPT. En **ese chat**, adjunta tu foto original y pega el prompt. No hace falta subir la foto al juego.
4. Copia la respuesta de la IA tal cual, vuelve al juego y pulsa **3 · PEGAR RESPUESTA**. Pega el texto y valida la ficha.
5. Sigue los pasos de spritesheet y retrato. Adjunta de nuevo la foto en el chat cuando sea necesario y sube las imágenes resultantes al juego.

La IA ya recibe la instrucción de devolver el formato correcto dentro del prompt. **El usuario no tiene que pedir el JSON expresamente ni redactar nada adicional.**

## Generación automática

El enlace **TENGO API KEY · HACERLO AUTOMÁTICO** lleva al modo avanzado con campo de clave Gemini y un selector de foto. **Solo en ese modo** se exige haber subido la foto al juego para poder generar automáticamente.

## Conservación de datos

No se cambian los formatos de personajes, los borradores guardados, el almacenamiento de luchadores ni su sincronización con Supabase. La clave Gemini no se incorpora a los borradores. Las imágenes, si se aportan mediante el modo manual, siguen procesándose al importarlas.

## Archivos de esta mejora

- `src/components/FighterCreator.tsx`: navegación guiada, explicación y controles.
- `src/components/fighterCreator.css`: distribución sin recortes en móvil.
- `public/sw.js`: versión de caché PWA.

Ningún cambio en Render o en el SQL de Supabase.
