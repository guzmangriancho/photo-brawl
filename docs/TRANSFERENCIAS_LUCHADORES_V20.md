# PHOTO BRAWL V20 — Transferir luchadores entre amigos

## 1. Primero, SQL

En **Supabase Dashboard → SQL Editor → New query**, pega **completo** `supabase/migrations/202611170002_fighter_transfers.sql` y pulsa **Run**. Debes haber ejecutado previamente el SQL base de V16.2 que crea `player_profiles`, `fighters` y los buckets `fighter-private` y `fighter-public`.

El SQL no borra luchadores existentes. Crea `fighter_transfers`, índices, RLS, acceso temporal y controlado a los dos archivos del destinatario y cuatro RPC de invitación/respuesta/aceptación.

Verifica con esta consulta en el SQL Editor:

```sql
select table_name from information_schema.tables
where table_schema='public' and table_name='fighter_transfers';

select proname from pg_proc
where proname in ('offer_fighter_transfer','respond_fighter_transfer',
                  'get_transfer_payload','accept_fighter_transfer');
```

## 2. Publicar frontend

En la raíz de la versión V20:

```cmd
npm install
npm run build
npm run test:transfers
git add .
git commit -m "V20 transferencias de luchadores entre cuentas"
git push origin main
```

Vercel desplegará la interfaz; **no hacen falta cambios en Render** ni nuevas claves. Mantén las claves anteriores `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Si no aparecen las pantallas nuevas, abre el dominio Production y vuelve a cargar la PWA.

## 3. Enviar

1. Inicia sesión en **CUENTA**. Recuerda que cada persona necesita un `USUARIO ÚNICO` (visible en su perfil, no su nombre público).
2. En **ELEGIR LUCHADOR**, selecciona uno propio y pulsa **TRANSFERIR**.
3. Introduce el usuario de tu amigo, por ejemplo `jugador_123`, sin `@`.
4. Confirma el envío. Mientras esté **PENDIENTE**, el luchador sigue siendo tuyo. Puedes cancelarlo desde **CUENTA → REGALOS → ENVIADOS**.
5. Si lo tenías publicado en Comunidad, primero utiliza **DEJAR DE PUBLICAR** (los luchadores públicos no se envían hasta ser privados).

## 4. Recibir

1. Abre **CUENTA → REGALOS → RECIBIDOS**. Verás remitente, luchador y estado.
2. Pulsa **ACEPTAR** o **RECHAZAR**. Aceptar descarga el retrato y spritesheet originales desde Storage privado y los guarda de forma privada bajo tu cuenta.
3. **Solo al confirmar ambos archivos en tu carpeta** Supabase cambia el `owner_id` del mismo luchador, dentro de una transacción. La identidad del personaje y sus movimientos se mantienen.
4. El luchador aparece en tu colección; si falla el almacenamiento local después de la transferencia, utiliza **CUENTA → MIS COPIAS → RECUPERAR DE LA NUBE**.
5. La solicitud caduca a los **14 días** si nadie la acepta.

## 5. Evitar duplicados y pérdidas

- La tabla `fighters` conserva una **única fila canónica**: no se inserta una segunda ficha al aceptar.
- Las imágenes se copian primero a Storage privado del receptor. Si fallan, la transferencia no cambia de dueño.
- La sincronización automática del emisor comprueba transferencias aceptadas y evita volver a subir la ficha antigua; al volver a la app borra su copia local anterior y limpia sus dos archivos de Storage antiguos cuando sea posible.
- El remitente puede estar desconectado durante la aceptación: verá desaparecer el personaje al volver a abrir el juego, recibir foco o pasar la siguiente comprobación de 30 segundos.
- Las copias de seguridad JSON o capturas guardadas externamente **no pueden revocarse**. La unicidad se garantiza en la **propiedad activa del juego**, no como DRM sobre imágenes descargadas.
- Supabase sigue siendo el lugar que registra la propiedad. Las cuentas mantienen sus estadísticas y ELO; estos no viajan con el luchador.

## 6. Prueba con dos cuentas

Usa dos navegadores diferentes, preferiblemente dos móviles, cada uno con su cuenta Supabase.

1. A: crea luchador, selecciona y transfiere a nombre único de B.
2. B: Cuenta → Regalos → Recibidos → Aceptar.
3. B: comprueba retrato, spritesheet, movimientos, selección y entrenamiento.
4. A: vuelve al menú y espera a la sincronización; ya no debe aparecer.
5. Prueba también RECHAZAR y CANCELAR con otro luchador: no deberían cambiar el propietario.
6. Verifica en `Supabase → Table Editor → fighters` que hay una fila con el mismo `id` y `owner_id` nuevo. En `fighter_transfers` debe figurar `accepted`.

**Nota:** no se han realizado pruebas contra tu Supabase real; las pruebas incluidas comprueban estructura, seguridad del protocolo y sintaxis. Recomendamos probar con un luchador de prueba antes de transferir uno irremplazable.
