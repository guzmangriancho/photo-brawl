## V13 — Fondos personalizados

Se han instalado los seis fondos pixel art enviados (uno para el menú y cinco escenarios). Ver `docs/ESCENARIOS_V13.md` para los detalles de selección y despliegue.

# PHOTO BRAWL V12 — Pulido visual y rounds best-of-three

**Actualización de la V11 con el fix WebSocket fragmentado incluido:** transparencia de los huecos interiores del spritesheet, reparación automática de imágenes antiguas de luchadores personalizados, proyectiles personalizados visibles también online, proporciones correctas del personaje del menú, creador mejor adaptado a móvil, cuenta atrás automática tras dos jugadores listos y partidas al mejor de tres (gana quien logra dos rondas).

- **Local:** `npm install` y `npm run dev:online` para probar también el online por Wi-Fi.
- **Internet:** sube estos archivos a tu repositorio de GitHub; Render y Vercel deben desplegar ambos la misma V12. Se mantienen las variables `VITE_ONLINE_WS_URL` y `ONLINE_ALLOWED_ORIGINS` de V11.
- **Pruebas:** `npm test` o `npm run test:online`.
- **Detalles de cambios y despliegue:** [`docs/CAMBIOS_V12.md`](docs/CAMBIOS_V12.md).

---

# PHOTO BRAWL V11 — VERSUS ONLINE (salas privadas)

**Nuevo:** modo 1v1 por WebSocket entre dos móviles, servidor Node.js autoritativo a 60 Hz, salas por código/invitación, listo, escenario, revancha, reconexión y partidas sin clasificación. La creación con IA, el modo local, los menús sin scroll y la PWA se mantienen.

**Para probar el online en dos teléfonos conectados a la misma Wi-Fi:**

```bash
npm install
npm run dev:online
```

Abre en ambos la URL `Network` de Vite, elige **VERSUS ONLINE** en Inicio, crea sala en un móvil y únete desde el otro con el código. Ambos marcan «LISTO» y comienza automáticamente una cuenta atrás de 3 segundos. Si solamente ejecutas `npm run dev`, NO arrancas el servidor online.

**Pruebas:** `npm test` (incluye `test:online`) o solo `npm run test:online`.

**Plan técnico y despliegue posterior en Vercel/Supabase:** [`docs/ONLINE_V11.md`](docs/ONLINE_V11.md). No necesitas Vercel ni Supabase para probar en LAN; para jugar a través de Internet sí necesitas alojar el servidor Node detrás de WSS. El ranking sigue siendo DEMO y no se guardan historiales locales.

---

# PHOTO BRAWL V10 — Persistencia y PWA

**Novedad:** los borradores del creador (foto, ficha, spritesheet, retrato y paso) se guardan en IndexedDB. Volver de Gemini o recargar la página recupera el trabajo cuando estaba abierto el creador. La instalación PWA tiene iconos, manifiesto, Service Worker, aviso en Android e instrucciones en iOS.

- Inicio normal: `npm install` y `npm run dev -- --host 0.0.0.0`. Puedes probar el guardado en el móvil por red Wi-Fi.
- Instalación PWA real: `npm run build`, publica `dist/` en **HTTPS** y ábrelo desde el móvil. La IP local `http://192.168...` no cumple los requisitos del popup nativo.
- Pruebas: `npm run test:pwa`, `npm run test:engine` y `npm run test:creator`.
- Guía de persistencia e instalación: [`docs/PWA_Y_BORRADORES_V10.md`](docs/PWA_Y_BORRADORES_V10.md).

---

# PHOTO BRAWL 16-BIT — V9 · Creador de luchadores con foto + IA

Juego de lucha arcade 2D para móvil y teclado. Esta versión **mantiene la navegación V8 sin header general ni scroll** e incorpora un creador completo y recuperable de personajes.

## Ejecutar

```bash
npm install
npm run dev -- --host 0.0.0.0
```

En el móvil, conéctate a la misma red Wi-Fi que el ordenador y abre la URL **Network** que muestra Vite. Puedes usar la aplicación en horizontal o vertical; se recomienda horizontal para jugar.

## Crear un luchador

**INICIO → ELEGIR LUCHADOR → CREAR CON FOTO**. El asistente tiene cuatro pasos visibles y sin scroll de página:

1. **FOTO Y FICHA**: sube una fotografía PNG/JPG/WEBP (máximo 15 MB), escribe un nombre opcional y genera automáticamente el diseño con Gemini o usa `COPIAR PROMPT` / `PEGAR ANÁLISIS JSON MANUAL`.
2. **SPRITES**: crea un spritesheet 4×4 usando la foto original y los seis movimientos generados, o copia el prompt y sube un spritesheet producido por otro medio. Se valida la cuadrícula, se elimina el verde del fondo (sin borrar camisetas verdes interiores) y se alinean los pies.
3. **RETRATO**: genera o importa el retrato pixel art; es independiente del spritesheet.
4. **GUARDAR**: revisa las estadísticas, pasiva, arquetipo y seis movimientos y guarda el luchador en el almacenamiento local IndexedDB.

Una imagen puede fallar sin borrar la otra ni perder el JSON de análisis. Cada paso permite volver a intentar, copiar el prompt o importar la imagen manualmente. Una vez creado, el luchador se selecciona en el roster. **Solo se puede comenzar un combate desde INICIO**, como en V8.

### Qué atributos son reales en el motor

- **Cuatro estadísticas:** HP, velocidad, potencia y técnica. Cada una 15–35 puntos; la suma es 100.
- **Cinco arquetipos:** Rushdown, Grappler/Tank, Zoner/Mage, Trickster o Shoto/Balanced.
- **Una habilidad pasiva real** elegida entre seis, incluido el doble salto **solo cuando corresponde**.
- **Seis técnicas conectadas al combate:** ataque ligero, ataque fuerte, especial neutral, especial adelante, especial arriba y súper.
- **Dirección de animación:** la IA explica en inglés cómo cargar y ejecutar el golpe ligero y fuerte con la misma extremidad.
- Nombres, descripciones temáticas, color de proyectil, escala de personaje, spritesheet y retrato.

Los mecanismos de los ataques se seleccionan exclusivamente entre los que ya implementa el motor. La IA no puede introducir habilidades inexistentes a partir de texto libre.

### Organización del spritesheet V9

4 filas × 4 columnas; 16 celdas de 256 px (lienzo 1024×1024):

| Celda | Pose | Celda | Pose |
|---|---|---|---|
| 0 | Idle A | 1 | Idle B |
| 2 | Caminar pierna izquierda | 3 | Caminar pierna derecha |
| 4 | Salto | 5 | Bloqueo |
| 6 | Preparación ataque ligero | 7 | Impacto ligero |
| 8 | Preparación ataque fuerte | 9 | Impacto fuerte |
| 10 | Especial neutral | 11 | Especial adelante |
| 12 | Especial arriba | 13 | Súper |
| 14 | Recibir daño | 15 | Proyectil aislado **o** KO según su técnica |

Las parejas 6→7 y 8→9 respetan la continuidad anatómica de las extremidades. El fondo plano `#00FF00` o transparente se recorta automáticamente. El procesador rechaza imágenes que no se parecen a una cuadrícula real, aunque **ninguna validación automática garantiza que Gemini respete perfectamente los dibujos**. Antes de guardar conviene revisar el arte.

Las fichas antiguas utilizan su organización anterior del spritesheet sin cambios.

## Configuración Gemini para desarrollo

El creador acepta una API Key **propia del usuario** introducida en el campo CLAVE GEMINI; el botón GUARDAR CLAVE la conserva en `localStorage` como en versiones anteriores del proyecto. El análisis usa `gemini-2.5-flash`; la generación de imágenes usa `gemini-3.1-flash-image` mediante Gemini `generateContent`. Los modelos deben estar disponibles en tu cuenta y región, con cuota; **pueden generar costes y errores por límite de uso**.

**IMPORTANTE DE CARA A APP STORE:** llamar a Gemini directamente desde el navegador con una API Key es una solución de **prototipado**, NO una arquitectura segura de producción. Para publicar: usar un backend que custodie las claves, autorice usuarios, aplique límites/cuotas, controle gastos y defina el tratamiento de fotografías e imágenes generadas. No incluyas tu clave privada en un frontend distribuido.

El modo **manual funciona sin clave**: copia primero el prompt JSON, pega la respuesta de Gemini web, y usa los dos prompts de imágenes adjuntando **la misma foto original**. También se pueden subir resultados desde otras herramientas siempre que cumplan la plantilla. Las fotografías se procesan localmente para comprimirlas y se envían a Gemini solo cuando se inicia una operación de generación IA. Los personajes guardados se quedan en este navegador/dispositivo (IndexedDB), sin sincronización.

**Documentación:** [`docs/CREADOR_IA_V9.md`](docs/CREADOR_IA_V9.md) incluye validación, recorrido detallado, limitaciones y pruebas. El documento original de prompts de V8 fue utilizado como referencia, pero la estructura del JSON y la distribución del spritesheet de V9 han cambiado.

## Calidad y pruebas

- `npm run test:creator`: valida esquema JSON, mecánicas, prompts y layout personalizado.
- `npm run test:engine`: prueba local del motor incluida en `tests/` (31 aserciones V5, entre ellas rasgos específicos de doble salto).
- Simulación de navegador realizada para importación manual y guardado local, navegación por los pasos y fallo parcial de imagen con respuesta Gemini simulada; no se realizaron llamadas reales a Gemini.
- Comprobado diseño sin scroll para 844×390, 667×375, 390×844 y 320×650.
- Servicios TypeScript y motor: comprobación de tipos independiente aprobada.
- **No se pudo compilar Vite en este entorno** porque faltaban dependencias npm descargables; ejecuta `npm install && npm run build` en tu equipo.

El ranking continúa siendo **DEMO** y no hay historial de combates locales.
