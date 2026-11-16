# PHOTO BRAWL V9 — Diseño e integración del creador de luchadores

## Objetivo y flujo de navegación

`INICIO → ELEGIR LUCHADOR → CREAR CON FOTO → [FOTO Y FICHA → SPRITES → RETRATO → GUARDAR] → ELEGIR LUCHADOR → INICIO → JUGAR AHORA`.

El creador no inicia combates. Tampoco añade botones de jugar a ninguna pantalla secundaria. Los cuatro pasos se presentan en un modal adaptado a móviles sin hacer scroll. Se puede regresar a cualquier paso anterior conservando los recursos correctos. Se separan **diseño / spritesheet / retrato** para poder reintentar o sustituir cualquier fase por un archivo manual.

### Fase 1 — análisis estructurado

Entradas: imagen original comprimida localmente a un lado máximo de 768 px y nombre opcional (máximo 16 caracteres). El análisis se solicita a `gemini-2.5-flash` con respuesta JSON estructurada. El prompt se encuentra en `src/services/fighterPrompts.ts` (`buildAnalysisPrompt`); la validación real en `src/services/geminiFighterGenerator.ts` (`parseFighterDesignJson`).

El JSON contiene:
- `fighterName`, `subtitle`, `archetype`, `visualDescriptionForSprite`.
- `stats`: `hp`, `speed`, `power`, `technique`, todos entre 15 y 35, suma 100. El parser corrige desviaciones por redondeo y normaliza si el resultado no suma exactamente 100.
- `passiveTrait`, `traitDescription`: uno de los seis rasgos que usa realmente el combate (el doble salto **no** se asigna automáticamente a todo el mundo).
- `moveset`: `lightNormal`, `heavyNormal`, `specialNeutral`, `specialForward`, `specialUp`, `ultimateSuper`, con **mecánicas dentro de las enumeraciones del juego** y nombres/acciones creativos según detalles visibles de la fotografía.
- `animationDirection.stanceStyle` y parejas `light` / `heavy`: `attackType`, `strikingLimb`, `windupAction`, `activeAction`. Ataques coherentes en dos frames sucesivos. El editor manual acepta JSON antiguo sin `animationDirection`, con descripción de pose por defecto.

**Los datos basados en la foto se limitan a elementos visibles**: pelo, peinado, expresión, ropa, calzado, accesorios, colores. No se infieren datos personales sensibles ni la identidad real.

### Fase 2 — spritesheet personalizable

`buildSpritePrompt(design)` utiliza la ficha y la fotografía original en una petición a `gemini-3.1-flash-image`. Especifica 4×4 (1024×1024 ideal), proporciones, mirada a la derecha, fondo verde puro #00FF00, sin texto, estilo pixel art de 16 bits modernizado y coherencia entre los frames consecutivos.

| Celda | Contenido |
|---|---|
| 0, 1 | Idle / respiración |
| 2, 3 | Ciclo de caminar con piernas alternadas |
| 4, 5 | Salto / bloqueo |
| 6, 7 | Preparación e impacto **ligero**, misma extremidad |
| 8, 9 | Preparación e impacto **fuerte**, misma extremidad |
| 10 | Especial neutral según mecánica real |
| 11 | Especial de avance, diferente del neutral |
| 12 | Antiaéreo / especial arriba |
| 13 | Súper específico |
| 14 | Reacción de daño |
| 15 | **Proyectil aislado** (STRAIGHT_FIREBALL, ARCING_LOB_OBJECT, BOOMERANG_RETURN, TRAP_MINE_DROP) o **KO** en personajes sin ese proyectil aislado |

El pipeline `processSpriteSheet` comprueba que la imagen sea casi cuadrada, al menos 60 % de muestras de esquinas por celda verdes/transparentes y al menos 12 de las 15 poses con píxeles no verdes. Después elimina chroma green mediante una selección conectada al exterior de cada celda (para conservar ropa y proyectiles de color verde), reduce los halos de borde, alinea los pies, procesa las 16 celdas en 1024×1024 y centra la celda 15 *solo si es proyectil* (KO se coloca en el suelo).

El motor `FightEngine` usa `spriteSheetLayoutVersion: 2` para asignar esos frames; personajes preexistentes siguen usando la tabla antigua. Para un proyectil se emplea el sprite de la celda 15 solo cuando corresponde; otros efectos se dibujan con el sistema existente. En luchadores sin proyectil, se utiliza la celda 15 para la caída/KO. **No se inventan fotogramas de otras técnicas que el motor no sepa interpretar**.

### Fase 3 — retrato

`buildPortraitPrompt(design)` solicita un retrato cuadrado 512×512, encuadre pecho-arriba, misma foto original, silueta y rostro legibles, paleta coherente con el especial. `processPortrait` centra/corta y escala a 512×512 PNG, aceptando imágenes de relación diferente y rechazando archivos demasiado pequeños.

### Fase 4 — revisión y guardado

Se muestran ambas imágenes, 4 estadísticas, 1 rasgo, arquetipo y los seis nombres reales. `buildCreatedProfile` crea el perfil con versión de layout y `scaleMultiplier` acorde al arquetipo. `saveCustomFighter` guarda en IndexedDB; la tarjeta aparece en el roster y puede seleccionarse para jugar desde Inicio.

### Fallback manual por separado

- **Falla el análisis:** `COPIAR PROMPT` en la primera fase, usarlo junto a la fotografía en Gemini web y pegar la respuesta en `PEGAR ANÁLISIS JSON MANUAL`. El parser señala los campos/mecánicas no válidos.
- **Falla el spritesheet:** se mantiene el análisis y, si ya estaba generado, el retrato. `COPIAR PROMPT` → adjuntar fotografía en la herramienta externa → descargar PNG/JPG/WEBP → `SUBIR IMAGEN`; también se puede reintentar por API.
- **Falla el retrato:** se mantienen ficha y spritesheet. Misma secuencia con el prompt de retrato y su importador independiente.
- Si la copia automática falla en Safari o por abrir el juego con HTTP en red local, el prompt permanece en un cuadro de texto para seleccionarlo y copiarlo manualmente.
- El importador admite hasta 15 MB por archivo. No se aceptan celdas con fondo de escenario o ilustraciones completas como si fueran un spritesheet.

### Seguridad y camino a producción

El acceso directo con clave en el navegador sirve **solo para pruebas locales**. La API Key escrita se pasa en el header HTTP `x-goog-api-key` (no en la URL); el botón de guardar la almacena en `localStorage` del dispositivo, **que no equivale a almacenamiento seguro**. Para distribución pública (App Store): servidor intermediario, autentificación, prevención de abusos, límites por cuenta, tratamiento transparente de fotos, control de costes y política de eliminación. Las imágenes originales no se suben a otros servidores de este proyecto salvo a Gemini cuando el usuario pulsa generar. Los recursos de luchadores personalizados persisten localmente en IndexedDB.

### Verificación ejecutada

1. `npm run test:engine` ✅ — aserciones existentes (31 con V5).
2. TypeScript sobre motor, tipos y servicios ✅ — sin errores de sintaxis. Prueba dedicada del esquema JSON, mecánicas y prompts añadida en `npm run test:creator`.
3. Simulación de navegador con subida de foto + JSON realista de seis movimientos + imagen verde 4×4 + retrato + guardar en IndexedDB ✅.
4. Simulación de Gemini sin llamadas a red: respuesta JSON válida, spritesheet correcto, error 429 al generar retrato, conservación de ficha y spritesheet y acceso al prompt de retrato ✅.
5. Layout probado a 844×390, 667×375, 390×844 y 320×650 ✅ — sin scroll del documento.

**Pendiente de verificar fuera de este entorno:** llamadas Gemini con una cuenta y modelos autorizados reales; calidad artística de generaciones reales, latencia, costes, respuesta en dispositivos físicos, compilación `npm run build` con dependencias npm instaladas y tamaño del almacenamiento para muchos luchadores.

**Prueba adicional:** imagen verde artificial con camiseta verde: el fondo se vuelve transparente y la camiseta conserva sus píxeles verdes.
