# V14 · Colección propia, tutorial y limpieza de sprites

## Cambios en navegación

- **Combate 1v1** (CPU), **Training** y **Versus Online** son los únicos tres modos principales.
- Se ha retirado **Versus local** de la interfaz. El motor conserva el modo interno `1P_VS_2P` porque el servidor online lo reutiliza para simular dos jugadores de forma autoritativa; no es una opción seleccionable.
- Los cuatro presets originales **no se borran**: son actores gratuitos exclusivos del botón **Tutorial** situado al pie del menú principal. Se puede elegir cualquiera de los cuatro y practicar movimiento, salto, golpes y técnica, sin necesidad de crear un luchador ni de pagar.
- Ningún preset aparece en **Elegir luchador**, rival CPU, Training normal ni en las salas nuevas creadas desde el cliente actualizado.
- La selección normal presenta solamente personajes personalizados guardados en el navegador, no presets. Si aún no existen, muestra un estado vacío con acceso directo a **Crear con foto**.
- Con un único personaje personalizado, se permite usarlo también como rival de entrenamiento/CPU. Nunca se añaden personajes de prueba en silencio.
- El ranking DEMO no representa a jugadores ni personajes reales: utiliza nombres e iniciales ficticios.

## Reparación de halos verdes

`src/engine/chromaKey.ts` conserva el corte del verde exterior y de los huecos cerrados, y además recorta el verde muy intenso que queda pegado al contorno del luchador. Sobre píxeles mezclados aplica *despill* local (sin difuminar la silueta), respetando las prendas verdes que no sean una franja de chroma.

- Los sprites creados desde esta versión se guardan con `spriteSheetKeyVersion: 3`.
- Al abrir el juego, los personajes anteriores (versiones 1 y 2) se reparan en IndexedDB sin reescalar las celdas ni modificar los movimientos.
- Si la imagen generada contiene líneas verdes incorporadas al dibujo y alejadas del exterior, es posible que algunos artefactos requieran regeneración manual; el algoritmo se centra en el halo adyacente al fondo.

## Tutorial

El tutorial es gratuito y se inicia desde **Inicio → Tutorial → elegir preset → Empezar**. Usa internamente el motor de entrenamiento con un muñeco pasivo. Contiene 5 etapas: caminar, saltar, ejecutar tres golpes, usar una técnica y practicar libremente. Reconoce la caminata y salto en el motor, así como los ataques enviados por los controles y el teclado. Se puede saltar un paso o salir al menú. Las habilidades propias de cada preset (incluido el doble salto solo donde exista) siguen intactas.

## Publicación y seguridad

**No se cambia el protocolo online ni el esquema de base de datos.** El cliente ya no ofrece personajes de ejemplo y el servidor rechaza perfiles marcados como preset o con identificador `preset_` al crear/unirse/cambiar personaje. **Publica la misma versión en Vercel y Render** para aplicar la regla. Los presets internos del tutorial y las pruebas del motor no deben eliminarse.

La PWA incrementa el identificador de caché a `pb-shell-v14-1`. Tras publicar, recargar desde el navegador y reiniciar la PWA instalada si sigue mostrando la versión vieja.

## Pruebas

- `npm test`: motor, creador, borradores PWA, tests específicos V14 y suites online.
- `npm run build`: compilación completa con las dependencias instaladas.
- Prueba recomendada: cuenta nueva sin personajes, cuenta con un personaje, cuenta con varios, tutorial con los cuatro presets, recuperación de sprite verde existente y creación de sala con un personaje personalizado.
