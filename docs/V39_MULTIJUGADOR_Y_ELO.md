# PHOTO BRAWL V39 · Combate de 4 + ELO

## Instalación del parche (sobre V38)

1. Haz copia de seguridad de tu proyecto V38.
2. Extrae el ZIP **en la raíz del proyecto**, permitiendo sustituir únicamente los archivos incluidos. El parche no contiene node_modules ni el proyecto entero.
3. Ejecuta `supabase/migrations/202611180004_group_ranked_elo.sql` en **Supabase → SQL Editor** (sin borrar las migraciones anteriores).
4. Actualiza **Vercel** (frontend) y **Render** (servidor). Mantén las variables ya usadas en el modo clasificatorio 1v1: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (o `SUPABASE_ANON_KEY`) y `SUPABASE_SECRET_KEY` (o `SUPABASE_SERVICE_ROLE_KEY`). **No** pongas la clave secreta en Vercel o en el frontend.
5. Para Render, el código TypeScript del motor y sus archivos JS compilados ya vienen incluidos. Se recomienda mantener el comando `npm run build:server-engine` en el proceso de despliegue para que coincidan.

## Nuevas reglas de combate

- 2v2 y FFA: orientación manual hacia izquierda/derecha con joystick o teclado; en 1v1 continúa la orientación automática.
- `ARRIBA + TÉCNICA` como antiaéreo: **una sola ejecución en el aire**, también si la primera se activó desde el suelo. Se recupera después de **aterrizar** en una plataforma o suelo. Se aplica a todos los modos.
- En los cuatro escenarios multinivel: salto más corto para los luchadores normales; los tanques mantienen altura suficiente para llegar a las primeras plataformas (gravedad ajustada). Los mapas clásicos no cambian.
- 2v2: cada luchador tiene 3 vidas. El equipo pierde **solo cuando ninguno de sus dos luchadores tiene vidas**. Los compañeros no pueden hacerse daño.
- FFA: gana el último luchador con vidas. Los demás se clasifican por **orden de eliminación**: el último eliminado ocupa mejor posición. Eliminaciones simultáneas empatan en puesto.
- Tiempo límite: 2v2 desempata por vidas totales y después salud proporcional sumada; FFA ordena por vidas restantes y porcentaje de salud, con empates exactos compartidos.
- Intro sobre la arena: `3 → 2 → 1 → ¡YA!` antes de empezar la física y el cronómetro. Se acorta la espera del lobby de cuatro jugadores para evitar dos cuentas atrás largas. En Render puede ajustarse con `ONLINE_GROUP_START_COUNTDOWN_MS` si fuera necesario.
- HUD: 3 corazones pixelados por luchador (rojos o negros), anillo del súper más delgado y marcadores de asiento/equipo sobre las cabezas, dimensionados para móvil.

## ELO de partidas online de 4 jugadores

- Al crear una sala online de **2v2** o **Free For All**, puedes elegir **AMISTOSO** o **CLASIFICATORIO**. Solo puntúa el segundo. En amistosos y CPU/local **no se modifica ELO**.
- Las cuatro personas deben tener cuenta de PHOTO BRAWL y haber iniciado sesión, con cuatro IDs diferentes, verificados por Supabase en Render. Un mismo usuario no puede ocupar dos posiciones.
- La clasificación y los resultados proceden exclusivamente del motor del servidor, no del cliente. Los resultados se guardan en la nueva tabla `group_ranked_matches` mediante una RPC invocable **solo por service_role**.
- **2v2**: el resultado del equipo determina la puntuación de ambos miembros; sus KO y daño personales **no afectan al ELO**. Se usa la media de rating de cada equipo y un ajuste ELO K=32. Si hay empate, ambos equipos mantienen su rating.
- **FFA**: cada participante se compara con los otros tres en función de su **posición final**; victoria relativa=1, empate en puesto=0.5, derrota relativa=0. El cambio de rating usa K=32 normalizado entre tres adversarios. Se preserva el mínimo de 100 puntos.
- Los resultados se registran **una sola vez por ID de partida**. Cada revancha tiene un nuevo ID válido. La pantalla final muestra los cuatro puestos y los ELO anteriores/posteriores cuando la sala era clasificatoria.

## Verificaciones y límites

- Pruebas del motor de combate, transiciones, partidas online de cuatro asientos y RPC de ELO con respuestas simuladas pasan con `npm run test:v39`.
- La compilación del motor del servidor funciona con `npm run build:server-engine`.
- **Pendiente de verificación externa:** ejecutar la migración real contra Supabase, probar cuatro navegadores conectados y compilar el frontend en una instalación con todas las dependencias de React/TypeScript completas (`npm ci && npm run build`).
