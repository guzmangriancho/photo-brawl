# PHOTO BRAWL V51 — PROGRESIÓN ARCADE, COPAS, ELO Y DÚOS

**Fecha:** 19 de noviembre de 2026 · **Base:** PHOTO BRAWL V50 (incluye V49 y versiones anteriores).

## 1. Decisión de diseño y referencias

**Recomendación implementada: modelo híbrido, no sustituir el ELO por trofeos.**

- **ELO GLOBAL:** puntuación competitiva de la CUENTA; se mantiene el algoritmo y el historial existente. Permite valorar la habilidad general independientemente del personaje.
- **COPAS POR LUCHADOR:** progresión personal de cada luchador propio persistido en la nube, para incentivar probar varios luchadores y evitar depender de uno solo. Un luchador puede ser Leyenda mientras otro sigue en Bronce.
- **COPAS DE DÚO:** progresión de la **pareja de dos cuentas** (UUID de jugadores), no de los personajes seleccionados. Los mismos dos amigos pueden cambiar de luchador y equipo sin perder su clasificación de dúo.
- **LIGAS:** seis umbrales reconocibles, aplicados **a cada luchador y a cada dúo**. Los marcos visuales se calculan a partir de las copas de la entidad; no se venden ni proporcionan ventajas jugables.

El modelo responde a dos objetivos diferentes: conservar un indicador de habilidad (ELO) y crear un recorrido de colección que estimule nuevos personajes y parejas (copas). La documentación de Supercell describe copas y prestigio ligados a cada brawler, progresión por retos como ganar con distintos brawlers y tarjetas de combate con marcos cosméticos. No se reutilizan gráficos, nombres de assets ni algoritmos privados de Supercell: esta implementación es propia y adaptada a la estructura de PHOTO BRAWL.

Fuentes consultadas (documentación pública disponible en noviembre de 2026):

1. https://support.supercell.com/brawl-stars/en/articles/prestige.html
2. https://support.supercell.com/brawl-stars/en/articles/records.html
3. https://support.supercell.com/brawl-stars/en/articles/battle-cards-7.html
4. https://supercell.com/brawlstars/en/blog/release-notes/release-notes-november-2026/
5. https://supabase.com/docs/guides/database/postgres/row-level-security
6. https://supabase.com/docs/guides/database/functions

## 2. Ligas V51

| Liga | Copas mínimas | Hasta siguiente | Identidad visual pixel art |
|---|---:|---:|---|
| BRONCE | 0 | 100 | Cobre, marrón oscuro |
| PLATA | 100 | 300 | Plata, gris azulado |
| ORO | 300 | 600 | Oro, amarillo |
| DIAMANTE | 600 | 1.000 | Cian, azul |
| MAESTRO | 1.000 | 1.600 | Violeta, magenta |
| LEYENDA | 1.600 | Sin techo | Coral, dorado |

Los marcos aparecen en la galería de **Comunidad**, el detalle y perfil público, la selección de luchadores, la **presentación VS** de 1v1, 2v2 y FFA, y los rankings. Tipografía `Press Start 2P`/`Pixelify Sans`, bordes cuadrados, sombras duras y `image-rendering:pixelated`; no se introducen medallas vectoriales de aspecto moderno ni imágenes copiadas.

La liga **actual** se calcula con las copas actuales; `best_trophies` guarda el récord histórico sin perderlo tras derrotas. El sistema **no implementa aún temporadas ni reinicios automáticos**. Mantener ligas permanentes en el lanzamiento evita reiniciar clasificaciones inesperadamente. Una temporada futura debería almacenar el récord permanente y hacer un reset suave de *solo* las copas competitivas, tras anunciarse y probarse.

## 3. Reglas de copas implementadas

Puntuación por resultado validado por **Render**, aplicada dentro de la transacción del ELO preexistente en Supabase:

| Copas actuales | Victoria 1v1 / equipo 2v2 | Derrota 1v1 / equipo 2v2 |
|---|---:|---:|
| 0–99 | +26 | 0 |
| 100–299 | +22 | −5 |
| 300–599 | +18 | −9 |
| 600–999 | +14 | −13 |
| 1.000–1.599 | +11 | −16 |
| 1.600+ | +9 | −20 |

**FFA:** 1.º +22 por debajo de 300, +16 entre 300 y 999, +12 desde 1.000. 2.º +8 por debajo de 600 y +4 desde 600. 3.º 0 por debajo de 100, −6 entre 100 y 599 y −10 después. 4.º 0 por debajo de 100, −10 entre 100 y 599 y −18 después. Los empates en primer puesto no cobran la recompensa de victoria, aunque sí se refleja el resultado en el ELO con sus reglas anteriores. **No hay copas negativas**: `greatest(0, copas + variación)`.

**BONUS DE ROTACIÓN:** +5 copas en la **primera victoria clasificatoria del día UTC con cada luchador distinto**, como máximo **tres luchadores distintos por día**. No se repite para el mismo luchador en ese día. No exige iniciar sesión a una hora determinada, y no permite cobrarlo con CPU ni amistosas.

**Dúos 2v2:** cada pareja de usuarios acumula una sola fila independiente de la elección de luchadores, con los mismos cambios de liga/resultado que arriba. Los equipos se derivan de los asientos reales del motor: **ROJO = asientos P1/P3 (índices 0/2)** y **AZUL = asientos P2/P4 (índices 1/3)**. Los UUID se ordenan canónicamente para que (A, B) sea el mismo dúo que (B, A). En empate 2v2 no se ganan ni pierden copas, pero cuenta como partida jugada.

**Solo online con cuatro personas autentificadas**: 1v1 actualiza ELO + copas de los dos luchadores. 2v2 actualiza ELO global de cuatro cuentas + copas de cuatro luchadores + copas de las dos parejas. FFA actualiza ELO global + copas de cuatro luchadores; no concede copas de dúo. No se puntúan clasificatorias con luchadores de la comunidad que no sean propios, ni contra la CPU, ni partidas locales, ni amistosas.

## 4. Modelo de datos Supabase

**Migración incluida:** `supabase/migrations/202611190001_progression_leagues_duos.sql` (y copia descargable independiente).

- `fighter_progress`: una fila por `fighters.id`; `account_id` vincula la progresión al propietario; copas actuales/máximas, victorias, derrotas, jugadas. Se crea automáticamente tras la primera clasificatoria. Las copas son **propias del luchador en esa cuenta**.
- `duo_progress`: una fila por dos UUID de usuario ordenados, con copas, récord y estadísticas.
- `fighter_progress_events`: registro de auditoría por partida, cuenta y luchador, con variación y bonus de rotación (sin acceso cliente).
- `duo_progress_events`: registro de auditoría por partida y pareja (sin acceso cliente).
- `pb_league`, `pb_cup_delta`, `pb_rotation_bonus`: funciones compartidas del servidor/SQL.
- `record_ranked_progress_match` y `record_group_ranked_progress_match`: nuevos RPC de **servicio**; llaman a las funciones ELO antiguas y registran copas en una única transacción.
- Activador `pb_reset_transferred_progress`: si un luchador se transfiere a otra cuenta, elimina la progresión anterior de ese luchador para evitar heredar puntos competitivos de su antiguo dueño. El histórico conserva la atribución al antiguo jugador.

### Seguridad

1. **Nunca se calculan ni se escriben copas desde el navegador.** `fighter_progress` y `duo_progress` tienen RLS y solo conceden `SELECT` autenticado. Solo el servidor usa la clave secreta en el backend para invocar los RPC.
2. La lectura pública de copas de luchadores está limitada a los **publicados**, excepto que el propietario pueda ver sus personajes privados. En comunidad, el ranking público filtra `fighters.is_public=true`. Publicar no modifica copas. Los datos privados de sprites no forman parte de la consulta del ranking.
3. Los RPC comprueban propiedad por `owner_id` + `local_id` **verificados antes de puntuar**, y cada partida se registra una sola vez por UUID. El backend ya verifica JWT, perfil de luchador, movimientos y estadísticas de la nube antes de admitir partidas clasificatorias.
4. Las tablas de eventos carecen de políticas cliente. Supabase recomienda RLS y restringir `EXECUTE` de funciones de escritura a los roles necesarios.

**Limitación de seguridad a revisar con el juego en producción:** las salas privadas con código y parejas que acuerdan resultados repetidos pueden facilitar *boosting*. Las validaciones existentes protegen la autenticidad del resultado del motor, pero no garantizan que los rivales sean aleatorios. Un sistema abierto competitivo necesita límites por enfrentamientos repetidos, señales antifraude, moderación y/o cola de matchmaking. Esto es trabajo futuro: no se ha simulado como ya desarrollado.

## 5. Interfaces y flujo de usuario

1. El arranque V49 sigue exigiendo sesión y ejecutar comprobación de sincronización y recuperación antes de mostrar el juego.
2. En **RANKING** aparecen tres pestañas: `ELO GLOBAL`, `COPAS LUCHADOR` y `DÚOS 2V2`. ELO es el ranking histórico; luchadores y dúos muestran top 50 accesible mediante páginas de 10. Las copas solo aparecen tras partidas V51.
3. En **ELEGIR LUCHADOR** se muestran liga, copas y progreso hacia el siguiente umbral de los personajes guardados en la cuenta.
4. En **VS** cada retrato tiene marco según las copas correspondientes, suministradas por el servidor para las partidas clasificatorias.
5. En resultados clasificatorios: se mantiene el **ELO global** y se añaden copas de los personajes y, si corresponde, las dos parejas. Se visualiza el bonus de rotación cuando se concede.
6. En **COMUNIDAD** los luchadores publicados muestran su marco; los luchadores privados siguen protegidos por las reglas anteriores.
7. Una **revancha** utiliza un UUID de partida nuevo y puede cambiar luchadores sin reiniciar la progresión del dúo; si se solicita otro luchador, el servidor vuelve a verificar que es suyo.

## 6. Instalación y migración, sin pérdida del ELO

**Orden obligatorio (despliegue coordinado):**

1. Haz una **copia de seguridad de Supabase** y anota la versión de Render desplegada.
2. Comprueba que ya estén aplicadas las migraciones de comunidad y ELO que necesita V50, en particular `202611170001_photo_brawl_community.sql`, `202611180002_ranked_result_details.sql` y `202611180004_group_ranked_elo.sql` (además de cualquier migración anterior necesaria para tu instalación).
3. En **Supabase → SQL Editor**, pega y ejecuta **TODO** `202611190001_progression_leagues_duos.sql`. No pegues la clave secreta en SQL, frontend ni ficheros públicos. La migración no elimina ni modifica los registros ELO actuales.
4. Despliega el **backend V51 en Render**, conservando sus variables `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY` (o equivalentes antiguos). Compila el motor Node como antes mediante `npm run build:server-engine` o el script que use Render.
5. Despliega el **frontend V51 en Vercel**, conservando variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_ONLINE_WS_URL` (este último apuntando al Render actualizado). V51 cambia el protocolo de presentación de copas; **hay que actualizar ambos despliegues**.
6. Abre la PWA, verifica que se inicia la sesión y se ejecuta la recuperación; fuerza recarga si un dispositivo sigue usando la caché antigua.
7. Juega una partida online **clasificatoria** 1v1 con dos cuentas y personajes propios sincronizados. Comprueba el ELO antiguo, las copas individuales y el marco. Después prueba un 2v2 clasificado con cuatro cuentas para verificar el ranking por parejas.

**Consultas SQL de solo lectura para verificar:**

```sql
select to_regclass('public.fighter_progress') as ranking_luchadores,
       to_regclass('public.duo_progress') as ranking_duos;
select public.pb_league(0) as bronce, public.pb_league(600) as diamante,
       public.pb_league(1600) as leyenda;
select has_function_privilege('authenticated',
  'public.record_ranked_progress_match(uuid,uuid,uuid,integer,integer,text,text,text,text)',
  'EXECUTE') as cliente_puede_otorgar_copas; -- debe ser false
select fighter_id, trophies, best_trophies, wins, played
from public.fighter_progress order by trophies desc limit 10;
select player_a, player_b, trophies, wins, played
from public.duo_progress order by trophies desc limit 10;
```

Si el servidor recibe `Could not find the function ... in the schema cache`, confirma que la migración terminó correctamente y reinicia/reintenta tras recargar el esquema de PostgREST en Supabase. Si la pantalla muestra copas a cero pero el ELO funciona, asegúrate de que los luchadores **ya estaban sincronizados en la tabla `fighters`** con el mismo `local_id`.

**Retrocompatibilidad:** las partidas V50 mantienen ELO pero no obtienen copas retrospectivamente, pues sus resultados no registraban los IDs verificables de los luchadores. No fabricamos ganancias históricas. Al desplegar V51 aparecen los nuevos rankings vacíos hasta que se jueguen partidas clasificatorias válidas. Si tienes que revertir, **vuelve primero Render a V50**, luego el frontend a V50; deja las nuevas tablas sin usar hasta poder evaluar una reversión de datos. No hagas `DROP` de tablas como método improvisado de rollback.

## 7. Pruebas, limitaciones y evolución sugerida

- **Ejecutadas en este entorno:** `node --test tests/*.test.cjs`, pruebas de regresión, nuevas pruebas de estructura de SQL, RPC y parseo TS/TSX. Estas no equivalen a una validación del SQL sobre una base PostgreSQL real.
- **Pendiente de verificar en tu infraestructura:** `npm ci && npm run build`, `npm run build:server-engine`, ejecución de la migración en Supabase, prueba de dos clientes 1v1 y cuatro clientes 2v2, móviles reales y pruebas de las políticas de RLS con credenciales autenticadas. Las dependencias React/Vite del entorno de edición no están completamente instaladas.
- **Balance por ajustar con telemetría:** tras 100–300 partidas de prueba revisar tiempo hasta Oro, pérdidas de Maestro, si FFA puntúa demasiado y si el bonus +5 incentiva rotación sin permitir abusos.
- **Fase posterior propuesta (no implementada):** misiones semanales por distintos luchadores, logros por jugar combinaciones de compañeros, ligas por temporada con recompensas cosméticas permanentes, filtro de emparejamiento por ELO y prevención de encuentros repetidos entre cuentas. Deben diseñarse sin resetear silenciosamente la progresión V51.
