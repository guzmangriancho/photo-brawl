# V58 · Ringside + Bitcoin Arcade

## Interfaz

Nueva dirección visual para inicio, colección, ficha, movimientos, selección de escenario, ajustes, creador, cuenta, comunidad, ranking, amigos, sala online, Ultimate, tutorial, presentación versus, HUD, pausa y revancha. Grafito, marfil y lima, tipografía condensada y paneles más limpios. El pixel art y los escenarios existentes se conservan.

En móvil vertical el menú permite desplazamiento para no esconder acciones. El combate mantiene su disposición fija y sus controles. Se respeta movimiento reducido.

## Bitcoin Arcade es solo una simulación

- Acceso desde Inicio, con 10.000 CR iniciales ficticios.
- BTC ficticio, sin conexión con Bitcoin real, precios reales, monederos, pagos ni retiradas.
- Compra y venta en CR. El precio cambia únicamente al pulsar Nueva ronda, con variación aleatoria máxima de ±12 % por ronda.
- Reto opcional de 100, 250 o 500 CR para el siguiente combate local 1v1 contra CPU. No se aplica a online, grupos, tutorial o entrenamiento.
- Victoria de P1: devuelve el doble de lo apostado. Derrota: pierde la cantidad. Empate, salida o recarga: devolución.
- Las revanchas no repiten el reto automáticamente. La liquidación es idempotente.
- Persistencia en localStorage, solo en este navegador y perfil de navegador. No se sincroniza entre dispositivos ni entre cuentas del juego en el mismo navegador. Borrar datos reinicia la simulación.
- Es una mecánica casual local, no una economía segura contra manipulación o uso simultáneo de varias pestañas.

## Despliegue

Solo frontend. No requiere migraciones SQL, cambios del servidor, credenciales nuevas ni permisos de cuenta.

## Verificación

- `npm run build`: TypeScript y compilación Vite.
- `npm test`: suite existente más `test:arcade`.
- 38 capturas de componentes reales en 1440×960, 390×844, 320×568 y 844×390. Inicio con colección y vacío, roster, movimientos, opciones, ajustes, tutorial, amigos, comunidad, ranking, online, acceso, Ultimate, combate de dos y cuatro jugadores, pausa, resultado y creador.
- Compra, selección de reto y persistencia tras recarga ejercitadas en navegador.
- Los datos visuales de prueba no se publican como ruta de la aplicación. Sin sesión de Supabase no se verifican envíos reales, publicación, invitaciones ni un combate online entre dos cuentas. Las pantallas conectadas se revisan con estados sin sesión/sin datos. La lógica previa de servicios y motores no se modifica.
