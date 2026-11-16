# PHOTO BRAWL — Versus online V11

## Qué funciona hoy

- Partidas privadas 1 contra 1 por código de seis caracteres o enlace de invitación.
- Ambos participantes escogen en su propio móvil el luchador que quieren llevar, incluidos luchadores hechos con IA y guardados localmente.
- Pantalla de sala: anfitrión, invitado, selección de escenario (solo anfitrión), listo/no listo y compartir invitación.
- **La partida solo se inicia desde la pantalla principal**, con ambos participantes listos. El anfitrión la inicia; no hay botón de comenzar en selección de personaje, configuración ni sala.
- Un único proceso Node.js simula el combate de forma **autoritativa a 60 pasos por segundo**, recibe únicamente controles/acciones y transmite estados a 30 Hz. El frontend dibuja estados recibidos, no calcula por su cuenta el daño del rival.
- Combate táctil y teclado, resultado y revancha por voto de ambos jugadores.
- Desconexión temporal: simulación detenida y reconexión con token (predeterminado 90 segundos); cuando pasa el plazo, se cierra la sala. Si el móvil pasa a segundo plano se sueltan los controles para evitar movimiento involuntario.
- Ranking sigue siendo DEMO, sin partidas clasificadas ni historial local.

**Alcance:** online entre amigos en una instancia de servidor. No hay emparejamiento público, identidades verificadas, eliminación completa de trampas, rollback GGPO, guardado de partidas en base de datos ni despliegue en producción configurado. Latencia, sincronía y calidad de conexión deben probarse en móviles reales y redes distintas.

## Probarlo en dos teléfonos, sin Supabase ni Vercel

En el ordenador que sirve el juego (ambos móviles conectados a la **misma Wi-Fi**):

```bash
npm install
npm run dev:online
```

Esto **compila el motor del servidor**, arranca los WebSockets en `ws://<IP_DEL_PC>:8787/ws` y Vite en `http://<IP_DEL_PC>:5173/`.

1. Abre la dirección **Network** de Vite desde los dos teléfonos; **no `localhost`**.
2. Móvil A: elige luchador → vuelve a Inicio → modo **VERSUS ONLINE** → **SALA PRIVADA** → **CREAR SALA**.
3. Copia el código o enlace de la sala.
4. Móvil B: elige su luchador → Inicio → modo online → Sala privada → introduce código → **UNIRSE**. El enlace con `?room=XXXXXX` también precarga el código.
5. Ambos pulsan **ESTOY LISTO**. El anfitrión cierra la hoja de sala y desde **INICIO** pulsa **¡COMENZAR ONLINE!**.
6. Lucha. Tras el KO ambos pueden solicitar revancha; cuando ambos aceptan, comienza una ronda nueva.

**Si falla:** comprueba que `:8787/health` responde desde el móvil, que el ordenador permite tráfico entrante TCP a los puertos **5173 y 8787**, y que la Wi-Fi no aísla clientes (redes de invitados suelen hacerlo). El servidor solo escucha conexiones si se arrancó con `npm run dev:online`; `npm run dev` en solitario ejecuta únicamente Vite. Una Wi-Fi local no prueba el acceso entre redes diferentes.

## Arquitectura actual

```text
Móvil A  --┐
           ├── WebSocket (controles / eventos) ── Node.js autoritativo
Móvil B  --┘                                    ├── Salas y tokens temporales
                                               ├── Simulación del motor a 60 Hz
Móvil A  <── fotogramas de estado a 30 Hz ─────┤
Móvil B  <───────────────────────────────────────┘
```

- `src/network/protocol.ts`: tipos de sala/estado y empaquetado de controles.
- `src/network/OnlineSession.ts`: cliente WebSocket, creación/unión, pings y reconexión.
- `src/components/OnlineLobby.tsx`, `online.css`: interfaz.
- `src/components/FightArena.tsx`: entrada online y reproducción de estados.
- `src/engine/FightEngine.ts`: **el mismo motor** para juego local y servidor; exporta/aplica `NetworkState`.
- `server/index.cjs`, `rooms.cjs`, `validation.cjs`, `transport.cjs`: servicio Node, control de salas, validación y WebSocket sin dependencias extras.
- `tests/online.test.cjs`: conexiones de prueba reales por WebSocket.

El backend **no recibe la fotografía original ni la clave de Gemini**, pero sí la ficha, retrato y spritesheet escogidos; estos recursos se transmiten al otro jugador para que su dispositivo pueda representar el combate. No crees luchadores basados en fotografías ajenas sin consentimiento.

## Paso siguiente: despliegue con Vercel y Supabase

**Ahora (sin servicios):** mantén la instancia de Node en un ordenador o servidor accesible con un dominio `wss://`, y publica el frontend Vite en HTTPS. Los móviles en redes distintas deben tener acceso al servidor; un servicio local `192.168.x.x` no es accesible a través de Internet.

**Vercel para el frontend:** configura `VITE_ONLINE_WS_URL=wss://online.tudominio.com/ws` en sus variables de entorno, y despliega el build estático (`npm run build`, directorio `dist`). En local puedes usar `.env.local` con `VITE_ONLINE_WS_URL=ws://...:8787/ws` si procede. No metas tokens secretos en variables `VITE_`.

**Servidor para sesiones en directo:** el servicio Node actual mantiene salas y simulación **en memoria de una instancia**. Debe ejecutarse como proceso persistente (por ejemplo, un host Node administrado) mientras usas este diseño. Si despliegas más réplicas, debes introducir un mecanismo de asignación de sala a instancia + estado compartido (o usar un framework de salas), en vez de poner varias réplicas indistintas detrás de un balanceador.

**Vercel WebSockets (2026):** Vercel Functions ya soporta conexiones WebSocket. Sin embargo, las conexiones nuevas no tienen por qué terminar en la misma función/instancia. No traslades este `rooms` en memoria sin rediseñar afinidad y persistencia: dos jugadores podrían acabar en procesos diferentes. Vercel puede servir el frontend; una función para el juego requiere un backend de salas adecuado.

**Supabase en futuro:** autenticación opcional, perfiles persistentes, metadatos de sala, inventario de personajes, RLS y Storage con políticas. Supabase Realtime (Broadcast/Presence) puede manejar lobby/presencia; **no sustituye automáticamente** la simulación autoritativa a 60 Hz y el netcode de un fighting game. Si más adelante hay matchmaking público/ranking, impleméntalos después de cuentas, moderación y controles contra abusos.

**CORS/orígenes del socket:** cuando publiques en HTTPS fija `ONLINE_ALLOWED_ORIGINS=https://tudominio.com,https://www.tudominio.com`. Para desarrollo, el backend acepta origen local con el mismo host/IP de LAN.

## Variables

| Variable | Dónde | Ejemplo | Descripción |
|---|---|---|---|
| `ONLINE_PORT` | Node | `8787` | Puerto del servidor de WebSocket |
| `ONLINE_ALLOWED_ORIGINS` | Node | `https://app.example.com` | Lista separada por comas; restringe el origen WebSocket |
| `ONLINE_RECONNECT_GRACE_MS` | Node | `90000` | Pausa mientras un móvil se reconecta (15–180 segundos) |
| `VITE_ONLINE_WS_URL` | Vite/Vercel | `wss://online.example.com/ws` | Dirección pública del servidor online; debe ser `wss://` en HTTPS |

## Escalado y calidad antes de publicar

1. Medir y estabilizar la latencia real por regiones; añadir predicción/rollback o un esquema de compensación adecuado para combos y golpes rápidos. Actualmente el servidor manda 30 actualizaciones/s y extrapola posiciones para el renderizado; se siente bien en LAN, **no hay garantía** de buena jugabilidad con latencia alta.
2. Sistema de cuentas/rate limiting compartido, protección de sala y del servidor contra abusos; supervisión, reconexión a través de réplicas y persistencia con expiración.
3. Servir retratos/sprites en almacenamiento privado con URLs temporales y políticas de consentimiento, para evitar transferirlos repetidamente en cada partida.
4. Procesar los estados del combate en una codificación más compacta, con snapshots delta, si el ancho de banda se vuelve importante.
5. Pruebas E2E en dos teléfonos distintos, 4G/5G, pérdida de paquetes, segundo plano y PWA instalada.

## Verificación local

`npm run test:online` compila el motor de Node y prueba WebSockets con dos clientes reales, sala y código, ready/start, autorización por rol, simulación del servidor y reconexión. `npm test` ejecuta además motor, creador y PWA. En un entorno sin dependencias npm, el servidor y sus tests pueden compilarse con un `tsc` global, pero el frontend requiere las dependencias declaradas en `package.json`.


## Solución móvil: `/health` funciona, pero WebSocket no conecta

En desarrollo, Vite ahora actúa como proxy WebSocket: el cliente abre `ws://IP_DEL_PC:5173/ws` y Vite lo reenvía internamente a `ws://127.0.0.1:8787/ws`. Así basta exponer el puerto 5173 al móvil. Los procesos Vite y Node deben ejecutarse ambos (`npm run dev:online`).

Si existe `VITE_ONLINE_WS_URL` en `.env.local`, eliminarla para usar el proxy durante desarrollo y reiniciar. Para producción, configurar `VITE_ONLINE_WS_URL=wss://.../ws` apuntando al servidor WebSocket desplegado.

Comprobar primero `http://IP_DEL_PC:8787/health` (salud de Node); después, en la consola del navegador, `new WebSocket('ws://IP_DEL_PC:5173/ws')` debe lanzar `open`. En PWA instaladas pueden persistir scripts anteriores; actualizar/cerrar y volver a abrir.
