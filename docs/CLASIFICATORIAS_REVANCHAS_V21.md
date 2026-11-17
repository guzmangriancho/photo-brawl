# V21 — Registrar todas las partidas clasificatorias

## Problema corregido

La función `public.record_ranked_match` de V16.3 tenía una protección que rechazaba cualquier segunda partida entre las mismas dos cuentas durante las siguientes 24 horas. Al devolver `same_opponent_cooldown`, la RPC no insertaba la fila en `ranked_matches` ni actualizaba el ELO, aunque el servidor hubiera terminado correctamente la partida.

## Solución

La migración `supabase/migrations/202611180001_ranked_rematches.sql` sustituye la función para que:

- Cada partida clasificatoria terminada se guarde en `ranked_matches`, también si es una revancha contra el mismo rival.
- Cada partida distinta actualice el ELO, las victorias y las derrotas de ambos jugadores.
- Se mantenga la protección contra duplicados: el mismo `match_id` no puede contabilizarse dos veces.
- Se conserven las validaciones del marcador, el bloqueo transaccional de perfiles y el acceso exclusivo de `service_role`.
- No se borren ni modifiquen las partidas anteriores.

El servidor ya genera un UUID nuevo cuando ambos jugadores aceptan una revancha, por lo que cada encuentro se identifica de forma independiente.

## Aplicación en Supabase

1. Abre el proyecto de Supabase → **SQL Editor**.
2. Copia y ejecuta el contenido completo de `supabase/migrations/202611180001_ranked_rematches.sql`.
3. No vuelvas a ejecutar la migración V16.3 para este cambio: la V21 ya reemplaza la función antigua.
4. Despliega la nueva versión del frontend para mostrar la confirmación del resultado en la pantalla final.

No hace falta cambiar las variables de Render ni redeplegar el servidor online: la validación y el envío del resultado ya funcionaban; el rechazo estaba en la función SQL.

## Comprobación

Juega dos clasificatorias consecutivas entre las mismas cuentas. En ambas pantallas finales debe aparecer **CLASIFICATORIA REGISTRADA** y el ELO actualizado. En SQL Editor puedes comprobar las últimas filas con:

```sql
select match_id, host_id, guest_id, winner_id,
       host_rating_before, host_rating_after,
       guest_rating_before, guest_rating_after, played_at
from public.ranked_matches
order by played_at desc
limit 20;
```

**Nota competitiva:** al contabilizar también las revanchas, dos usuarios pueden intentar pactar resultados en salas privadas para alterar su ELO. La protección por UUID evita duplicar una misma partida, pero no impide el amaño entre cuentas que juegan repetidamente entre sí.
