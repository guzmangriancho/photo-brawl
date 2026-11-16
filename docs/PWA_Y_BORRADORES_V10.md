# PHOTO BRAWL V10 — Borradores persistentes e instalación PWA

## Qué se ha corregido

Antes el creador de luchadores vivía únicamente en el estado de React. Los navegadores móviles pueden suspender o descartar una pestaña cuando se abre otra aplicación (por ejemplo Gemini); al volver, el juego arranca de nuevo.

V10 guarda el borrador completo en **IndexedDB** del origen del juego, incluido:

- Foto original como archivo binario (para reutilizarla en Gemini sin tener que seleccionarla otra vez).
- Nombre opcional, ficha JSON y el estado de los cuatro pasos.
- Análisis ya procesado y las imágenes del spritesheet y retrato, incluso si solo una está lista.
- Errores de generación y el editor JSON manual.

Los cambios se guardan automáticamente al editar (pausa de ~220 ms), al ocultar la pestaña (`visibilitychange`) y al salir de la página (`pagehide`). Se serializan las escrituras para evitar que un borrador antiguo sobrescriba al nuevo.

Cuando el creador estaba **abierto** al descargarse la página, se guarda una pequeña marca en `localStorage`. Al abrir de nuevo, PHOTO BRAWL vuelve a **Elegir luchador → Creador** y recupera el paso y sus archivos. El indicador superior muestra **GUARDADO**, **RECUPERADO**, **GUARDANDO** o **ERROR AL GUARDAR**.

**Cerrar (×) conserva el borrador.** **BORRAR** pide confirmación y elimina todas las imágenes, foto y ficha del borrador. **GUARDAR LUCHADOR** crea el personaje y limpia el borrador. Los luchadores ya creados siguen en la tabla `custom_fighters` anterior; se incrementó el esquema IndexedDB a v2 sin borrar la plantilla.

La clave Gemini no forma parte del borrador: si deseas que persista al recargar, pulsa **GUARDAR CLAVE** en el creador o en Ajustes. Es una función de desarrollo; en producción debería trasladarse al backend.

### Prueba del fallo original

1. En móvil, entra en `Elegir luchador → Crear con foto`.
2. Selecciona la foto y rellena nombre o JSON; si tienes una ficha, entra en Sprites.
3. Espera a que el indicador diga **GUARDADO**.
4. Copia el prompt y cambia de aplicación a Gemini. Genera una imagen.
5. Regresa al navegador o, para forzar la prueba, **recarga la pestaña**.
6. Debe reabrirse el creador en el mismo paso, con su foto/ficha y las imágenes ya importadas.
7. Importa spritesheet/retrato y finaliza.

Si el navegador está en modo privado, se borra su almacenamiento, cambia el origen (dirección/dominio/puerto) o el dispositivo no deja guardar por falta de espacio, no se puede garantizar la recuperación. El usuario verá un error cuando falle el guardado.

## PWA: instalación en móviles

Contiene `public/manifest.webmanifest`, iconos propios 192/512, Apple Touch Icon y un Service Worker con caché limitada a archivos estáticos **del juego**, no fotos del usuario ni peticiones Gemini.

En navegador Android compatible (por ejemplo Chrome), si se cumple la instalación y llega `beforeinstallprompt`, aparece un aviso pequeño para **INSTALAR**. Si se descarta, no vuelve a insistir durante 14 días. En **Ajustes → Instalar juego como app** se puede abrir de nuevo.

En iPhone/iPad **no existe un popup de instalación del sistema** compatible con `beforeinstallprompt`. PHOTO BRAWL muestra un aviso con las instrucciones para hacerlo desde Safari: **Compartir → Añadir a pantalla de inicio**. Si la página se abre con otro navegador en iOS, el aviso recomienda abrirla en Safari.

La PWA instalada funciona en una ventana propia, sin las barras normales del navegador. Solo la parte estática de la interfaz puede funcionar sin conexión cuando ya se ha almacenado; **Gemini requiere Internet**. Los archivos de lucha personalizados siguen en IndexedDB del dispositivo.

### IMPORTANTE: HTTPS en el móvil

`npm run dev -- --host 0.0.0.0` permite probar el juego desde `http://192.168.x.x:5173` y **comprobar recuperación de borradores**, pero esa dirección HTTP no es un origen seguro. No se debe esperar que aparezca el **popup nativo de instalación** de Android desde esa URL.

Para probar **la instalación real**, compila:

```bash
npm install
npm run build
```

Publica `dist/` en un hosting **HTTPS** (por ejemplo Netlify, Vercel o Cloudflare Pages) bajo la raíz del dominio. Entra desde el móvil en esa dirección HTTPS. Se puede probar PWA local en el propio ordenador con `localhost`, pero el `localhost` del ordenador no es el `localhost` del móvil.

**ATENCIÓN iOS:** Safari y la PWA instalada pueden mantener **almacenamientos separados**. Si ya empezaste un luchador dentro de Safari, termina ese personaje en Safari antes de instalar y abrir la PWA; no damos por hecho que Safari transfiera el borrador automáticamente.

## Verificación de esta entrega

- `node tests/pwaDraft.test.cjs`: validaciones de esquema, restauración, flujo, manifest, Service Worker y sintaxis TS/TSX.
- `node tests/fightEngine.test.cjs` y `node tests/creatorDesign.test.cjs`: pruebas heredadas.
- No se pudo ejecutar la app completa con Vite ni efectuar un test físico de instalación: este entorno no dispone de las dependencias descargables de npm y su navegador de pruebas bloquea la navegación incluso a localhost. Las comprobaciones anteriores no sustituyen una prueba con tu móvil.

## Limitaciones conocidas

- Un borrador se guarda en **este origen y este perfil de navegador**, no se sincroniza con la nube.
- Si el sistema cierra la página **durante una escritura que aún no se ha confirmado**, la última acción podría no conservarse. El aviso GUARDADO indica que la transacción finalizó.
- Un proceso Gemini en curso al suspender la página podría interrumpirse; las partes que estaban guardadas permanecen.
- Para distribuir en App Store oficial se necesita un empaquetado y publicación adicionales; PWA no equivale a una app publicada en App Store.
