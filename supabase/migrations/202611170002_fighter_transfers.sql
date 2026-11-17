-- PHOTO BRAWL V20 · Transferencias de luchadores entre cuentas.
-- APLICAR DESPUÉS de 202611170001_photo_brawl_community.sql.
-- No borra personajes existentes, estadísticas, usuarios ni partidas.
-- Ejecutar el archivo entero desde Supabase > SQL Editor.

create table if not exists public.fighter_transfers (
  id uuid primary key default gen_random_uuid(),
  fighter_id uuid references public.fighters(id) on delete set null,
  canonical_fighter_id uuid not null,
  sender_id uuid not null references public.player_profiles(id) on delete cascade,
  recipient_id uuid not null references public.player_profiles(id) on delete cascade,
  original_local_id text not null,
  source_portrait_path text not null,
  source_sheet_path text not null,
  fighter_name text not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  responded_at timestamptz,
  constraint no_self_transfer check (sender_id <> recipient_id)
);
create unique index if not exists fighter_transfer_one_pending_idx on public.fighter_transfers(fighter_id) where status='pending';
create index if not exists fighter_transfer_received_idx on public.fighter_transfers(recipient_id,created_at desc);
create index if not exists fighter_transfer_sent_idx on public.fighter_transfers(sender_id,created_at desc);

alter table public.fighter_transfers enable row level security;
revoke all on public.fighter_transfers from public,anon,authenticated;
grant select on public.fighter_transfers to authenticated;
drop policy if exists "Ver mis transferencias" on public.fighter_transfers;
create policy "Ver mis transferencias" on public.fighter_transfers for select to authenticated
  using (sender_id=(select auth.uid()) or recipient_id=(select auth.uid()));
-- INSERT/UPDATE/DELETE no están expuestos al navegador: solamente RPC atómicas.

-- La lectura temporal de los 2 ficheros se permite SOLO al destinatario
-- de una solicitud pendiente no expirada. No revela ninguna foto original.
create or replace function public.can_read_transfer_image(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(
  select 1 from public.fighter_transfers t
  join public.fighters f on f.id=t.fighter_id
  where t.recipient_id=(select auth.uid())
    and t.status='pending' and t.expires_at>now()
    and f.owner_id=t.sender_id and f.is_public=false
    and (f.private_sheet_path=p_path or f.private_portrait_path=p_path)
 );
$$;
revoke all on function public.can_read_transfer_image(text) from public,anon,authenticated;
grant execute on function public.can_read_transfer_image(text) to authenticated;
drop policy if exists "Leer imágenes del luchador ofrecido" on storage.objects;
create policy "Leer imágenes del luchador ofrecido" on storage.objects for select to authenticated
 using (bucket_id='fighter-private' and (select public.can_read_transfer_image(name)));

create or replace function public.offer_fighter_transfer(p_fighter_id uuid,p_recipient_username text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_sender uuid:=auth.uid();
 v_recipient uuid;
 v_row public.fighters%rowtype;
 v_id uuid;
begin
 if v_sender is null then raise exception 'Inicia sesión para transferir luchadores'; end if;
 if p_recipient_username is null or lower(trim(p_recipient_username)) !~ '^[a-z0-9_]{3,24}$' then
   raise exception 'Introduce un nombre de usuario válido';
 end if;
 select * into v_row from public.fighters where id=p_fighter_id for update;
 if not found or v_row.owner_id<>v_sender then raise exception 'El luchador no pertenece a tu cuenta'; end if;
 if v_row.is_public then raise exception 'Primero deja de publicar el luchador en Comunidad'; end if;
 if v_row.local_id like 'preset_%' or coalesce((v_row.fighter_data->>'isPreset')::boolean,false) then
   raise exception 'Los personajes del tutorial no se pueden transferir';
 end if;
 select id into v_recipient from public.player_profiles where username=lower(trim(p_recipient_username));
 if v_recipient is null then raise exception 'No existe ese usuario. Comprueba su nombre único'; end if;
 if v_recipient=v_sender then raise exception 'No puedes enviarte un luchador a ti mismo'; end if;
 -- Las invitaciones vencidas se cancelan de forma segura antes de ofrecer de nuevo.
 update public.fighter_transfers set status='cancelled',responded_at=now()
  where fighter_id=p_fighter_id and status='pending' and expires_at<=now();
 if exists(select 1 from public.fighter_transfers where fighter_id=p_fighter_id and status='pending') then
  raise exception 'Este luchador ya tiene una transferencia pendiente';
 end if;
 insert into public.fighter_transfers(fighter_id,canonical_fighter_id,sender_id,recipient_id,original_local_id,source_portrait_path,source_sheet_path,fighter_name)
 values (v_row.id,v_row.id,v_sender,v_recipient,v_row.local_id,v_row.private_portrait_path,v_row.private_sheet_path,v_row.fighter_name) returning id into v_id;
 return jsonb_build_object('id',v_id,'recipient_username',lower(trim(p_recipient_username)));
end;
$$;
revoke all on function public.offer_fighter_transfer(uuid,text) from public,anon,authenticated;
grant execute on function public.offer_fighter_transfer(uuid,text) to authenticated;

create or replace function public.respond_fighter_transfer(p_transfer_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.fighter_transfers%rowtype;
begin
 if auth.uid() is null then raise exception 'Sesión requerida'; end if;
 if p_action not in ('declined','cancelled') then raise exception 'Acción no permitida'; end if;
 select * into v_request from public.fighter_transfers where id=p_transfer_id for update;
 if not found then raise exception 'Transferencia no encontrada'; end if;
 if v_request.status<> 'pending' then raise exception 'Esta transferencia ya se ha resuelto'; end if;
 if (p_action='declined' and v_request.recipient_id<>auth.uid()) or
    (p_action='cancelled' and v_request.sender_id<>auth.uid()) then
   raise exception 'No tienes permiso para responder';
 end if;
 update public.fighter_transfers set status=p_action,responded_at=now() where id=p_transfer_id;
 return jsonb_build_object('status',p_action);
end;
$$;
revoke all on function public.respond_fighter_transfer(uuid,text) from public,anon,authenticated;
grant execute on function public.respond_fighter_transfer(uuid,text) to authenticated;

-- Resuelve el contenido completo SOLO para el destinatario en estado pendiente.
create or replace function public.get_transfer_payload(p_transfer_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_transfer public.fighter_transfers%rowtype; v_fighter public.fighters%rowtype;
begin
 if auth.uid() is null then raise exception 'Inicia sesión'; end if;
 select * into v_transfer from public.fighter_transfers where id=p_transfer_id;
 if not found or v_transfer.recipient_id<>auth.uid() or v_transfer.status<>'pending'
    or v_transfer.expires_at<=now() then raise exception 'Invitación no disponible'; end if;
 select * into v_fighter from public.fighters where id=v_transfer.fighter_id;
 if not found or v_fighter.owner_id<>v_transfer.sender_id or v_fighter.is_public then
   raise exception 'El luchador ya no está disponible';
 end if;
 return jsonb_build_object(
   'fighter_id',v_fighter.id,'fighter_data',v_fighter.fighter_data,
   'fighter_name',v_fighter.fighter_name,'private_sheet_path',v_fighter.private_sheet_path,
   'private_portrait_path',v_fighter.private_portrait_path);
end;
$$;
revoke all on function public.get_transfer_payload(uuid) from public,anon,authenticated;
grant execute on function public.get_transfer_payload(uuid) to authenticated;

-- Transferencia atómica de la propiedad: el destinatario sube primero los
-- 2 recursos a su carpeta privada; la BD comprueba su existencia y cambia el
-- propietario del MISMO registro original. Nunca se crea otro fighter.
create or replace function public.accept_fighter_transfer(
 p_transfer_id uuid,p_new_portrait_path text,p_new_sheet_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_recipient uuid:=auth.uid();
 v_request public.fighter_transfers%rowtype;
 v_fighter public.fighters%rowtype;
 v_new_local_id text;
begin
 if v_recipient is null then raise exception 'Inicia sesión'; end if;
 select * into v_request from public.fighter_transfers where id=p_transfer_id for update;
 if not found or v_request.recipient_id<>v_recipient then raise exception 'Invitación no disponible'; end if;
 v_new_local_id:='gift_' || v_request.canonical_fighter_id::text;
 if v_request.status='accepted' then
   return jsonb_build_object('fighter_id',v_request.canonical_fighter_id,'local_id',v_new_local_id,'status','accepted');
 end if;
 if v_request.status<>'pending' or v_request.expires_at<=now() then
   raise exception 'La invitación está cancelada o caducada';
 end if;
 select * into v_fighter from public.fighters where id=v_request.fighter_id for update;
 if not found or v_fighter.owner_id<>v_request.sender_id or v_fighter.is_public then
   raise exception 'El luchador ya no está disponible';
 end if;
 if p_new_portrait_path <> (v_recipient::text||'/'||v_fighter.id::text||'/portrait.png') or
    p_new_sheet_path <> (v_recipient::text||'/'||v_fighter.id::text||'/sheet.png') then
   raise exception 'Ruta de imágenes incorrecta';
 end if;
 if not exists(select 1 from storage.objects where bucket_id='fighter-private' and name=p_new_portrait_path)
    or not exists(select 1 from storage.objects where bucket_id='fighter-private' and name=p_new_sheet_path) then
   raise exception 'Sube primero el retrato y el spritesheet';
 end if;
 update public.fighters set owner_id=v_recipient,local_id=v_new_local_id,
    private_portrait_path=p_new_portrait_path,private_sheet_path=p_new_sheet_path,
    is_public=false,public_portrait_path=null,public_sheet_path=null,updated_at=now()
 where id=v_fighter.id;
 update public.fighter_transfers set status='accepted',responded_at=now() where id=v_request.id;
 return jsonb_build_object('fighter_id',v_fighter.id,'local_id',v_new_local_id,'status','accepted');
end;
$$;
revoke all on function public.accept_fighter_transfer(uuid,text,text) from public,anon,authenticated;
grant execute on function public.accept_fighter_transfer(uuid,text,text) to authenticated;

-- Impide que la copia automática antigua vuelva a publicar el luchador ya transferido.
-- El control final vive en Postgres, aunque el emisor siga con otra pestaña abierta.
create or replace function public.sender_has_transferred_local_id(p_local_id text)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.fighter_transfers
   where sender_id=(select auth.uid()) and original_local_id=p_local_id and status='accepted');
$$;
revoke all on function public.sender_has_transferred_local_id(text) from public,anon,authenticated;
grant execute on function public.sender_has_transferred_local_id(text) to authenticated;
drop policy if exists "Subir luchador propio" on public.fighters;
create policy "Subir luchador propio" on public.fighters for insert to authenticated
 with check (owner_id=(select auth.uid()) and not (select public.sender_has_transferred_local_id(local_id)));

-- Verificación opcional en SQL Editor:
-- select proname from pg_proc where proname in ('offer_fighter_transfer','accept_fighter_transfer','respond_fighter_transfer','get_transfer_payload');
