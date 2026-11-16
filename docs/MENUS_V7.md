# PHOTO BRAWL — Guía de menús V7

## Objetivo visual

Estética arcade 16-bit modernizada, inspirada en los conceptos suministrados: paneles biselados, contornos, tipografía pixel de resolución media, luces neón, iconografía universal de Lucide y fondo dibujado localmente en SVG. Los personajes y el motor de combate se conservan. Prioridad horizontal móvil, con navegación apilada y desplazamiento vertical en retrato.

## Navegación implementada

- Inicio -> COMBATE 1V1 -> selección, 4 modos, P1/P2, 3 escenarios, CPU fácil/normal/difícil -> arena.
- Inicio -> MODO TRAINING -> selección ya preparada en training -> arena.
- Inicio -> CREAR CON FOTO (IA) -> selector de foto, nombre opcional, API key, creación Gemini real -> luchadores.
- Inicio -> MI LUCHADOR -> roster completo, perfil, estadísticas, pasiva y acceso a técnicas y combate.
- Inicio -> MOVIMIENTOS -> 6 ataques reales del luchador equipado, comandos táctiles y combos de iniciación.
- Inicio -> TOP RANKING DEMO -> podium visual de luchadores predefinidos (ELO *ficticio*, sin base de datos).
- Inicio -> AJUSTES -> opacidad (35–100%), joystick fijo/flotante, controles invertidos para zurdos, vibración, sonido, gestión de Gemini.

Se conserva la compatibilidad con teclado; en móvil los controles de V5 usan joystick flotante/fijo, botones A y B, salto independiente y super condicionado a energía. La habilidad DOUBLE_JUMP sigue dependiendo exclusivamente del personaje.

## Ranking de demostración

El ranking es un mockup visual sin autenticación, sin servidor, sin conexión a combates ni persistencia de resultados. Se muestra la palabra DEMO en el avance y la pantalla completa, y se explica que los valores son simulados. Utiliza exclusivamente los retratos y nombres de luchadores predefinidos, pero los números ELO no son reales. Un futuro backend podrá reemplazar DEMO_SCORES / DEMO_ORDER por una fuente real.

**No hay historial local de combates.** La base del proyecto es la V5, sin ningún servicio de historial.

## Datos genuinos

La fuente de verdad es `src/data/presetFighters.ts`, `src/types/fighter.ts` y los perfiles de IndexedDB. Se muestran cuatro presets (EL MOZO, OSO MOSTAZA, MAGA NEÓN, SOMBRA NINJA), con `stats`, `passiveTrait`, `traitDescription`, `archetype`, `moveset`. Si se generan personajes propios desde foto, aparecen en selección y en la ficha usando su perfil. GUZMÁN, como en el concept art, no existe actualmente entre los presets.

## QA

- Revisión visual en Chromium con resoluciones 320×650, 390×844, 667×375, 844×390, 1024×576 y 1280×720.
- Pruebas de interacción en prototipo renderizado desde TSX: abrir TRAINING, navegar, ver ranking DEMO, mover slider, abrir/cerrar configuración de clave.
- Pruebas de motor heredadas V5: 31 aserciones superadas.
- La compilación real con Vite requiere instalar `npm install`. Este entorno no ha conseguido descargar dependencias de npm; por ello no se afirma un build completo.
