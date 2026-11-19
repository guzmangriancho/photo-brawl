-- PHOTO BRAWL V56 · Amistades e invitaciones directas
-- Requiere el esquema de cuentas V16. Ejecutar una vez, después de las migraciones V55.
-- Solo el servidor de combate controla las salas; aquí se guardan invitaciones, NO resultados.

create table if not exists public.pb_friendships (
 user_a uuid not null references public.player_profiles(id) on delete cascade,
 user_b uuid not null references public.player_profiles(id) on delete cascade,
 requested_by uuid not null references public.player_profiles(id) on delete cascade,
 status text not null default 'pending' check (status in ('pending','accepted')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(user_a,user_b),
 constraint pb_friends_order check (user_a < user_b),
 constraint pb_friends_sender check (requested_by = user_a or requested_by = user_b)
);
create index if not exists pb_friends_b_idx on public.pb_friendships(user_b,status);

create table if not exists public.pb_game_invitations (
 id uuid primary key default gen_random_uuid(),
 inviter_id uuid not null references public.player_profiles(id) on delete cascade,
 invitee_id uuid not null references public.player_profiles(id) on delete cascade,
 room_code text not null check (room_code ~ '^[A-Z0-9]{6}$'),
 battle_mode text not null check (battle_mode in ('1V1','2V2','FREE_FOR_ALL')),
 ranked boolean not null default false,
 status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now() + interval '15 minutes'),
 responded_at timestamptz,
 constraint pb_invite_other check (inviter_id <> invitee_id),
 constraint pb_invite_unique_per_room unique(inviter_id,invitee_id,room_code)
);
create index if not exists pb_invites_inbox_idx on public.pb_game_invitations(invitee_id,created_at desc);
create index if not exists pb_invites_sent_idx on public.pb_game_invitations(inviter_id,created_at desc);

alter table public.pb_friendships enable row level security;
alter table public.pb_game_invitations enable row level security;
revoke all on public.pb_friendships, public.pb_game_invitations from public, anon, authenticated;
grant select on public.pb_friendships, public.pb_game_invitations to authenticated;

drop policy if exists "v56_friend_participants_read" on public.pb_friendships;
create policy "v56_friend_participants_read" on public.pb_friendships for select to authenticated
 using ((select auth.uid()) in (user_a,user_b));
drop policy if exists "v56_invite_participants_read" on public.pb_game_invitations;
create policy "v56_invite_participants_read" on public.pb_game_invitations for select to authenticated
 using ((select auth.uid()) in (inviter_id,invitee_id));

-- Al enviar solicitud se comprueba identidad, existencia, límites y no autoinvitación.
create or replace function public.pb_friend_request(p_username text)
returns text language plpgsql security definer set search_path = '' as $$
declare
 me uuid := auth.uid(); other_id uuid; a uuid; b uuid; current_status text; requester uuid;
begin
 if me is null then raise exception 'Debes iniciar sesión'; end if;
 select id into other_id from public.player_profiles where username=lower(trim(p_username));
 if other_id is null then raise exception 'No existe ese usuario'; end if;
 if other_id=me then raise exception 'No puedes agregarte a ti mismo'; end if;
 a:=least(me,other_id);b:=greatest(me,other_id);
 select status,requested_by into current_status,requester from public.pb_friendships
  where user_a=a and user_b=b for update;
 if current_status='accepted' then return 'already_friends'; end if;
 if current_status='pending' then
   if requester=me then return 'already_sent'; end if;
   update public.pb_friendships set status='accepted',updated_at=now() where user_a=a and user_b=b;
   return 'accepted';
 end if;
 if (select count(*) from public.pb_friendships where status='pending' and requested_by=me and created_at>now()-interval '1 hour')>=25
   then raise exception 'Has enviado demasiadas solicitudes. Prueba más tarde'; end if;
 insert into public.pb_friendships(user_a,user_b,requested_by) values(a,b,me);
 return 'sent';
end;$$;

create or replace function public.pb_friend_reply(p_other uuid,p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid:=auth.uid(); a uuid; b uuid; sender uuid; st text;
begin
 if me is null or p_other is null or me=p_other then raise exception 'Solicitud inválida'; end if;
 a:=least(me,p_other);b:=greatest(me,p_other);
 select requested_by,status into sender,st from public.pb_friendships where user_a=a and user_b=b for update;
 if st is distinct from 'pending' or sender=me then raise exception 'No hay solicitud entrante'; end if;
 if p_accept then update public.pb_friendships set status='accepted',updated_at=now() where user_a=a and user_b=b;
 else delete from public.pb_friendships where user_a=a and user_b=b; end if;
end;$$;

create or replace function public.pb_friend_remove(p_other uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid:=auth.uid();
begin
 if me is null or p_other is null or me=p_other then raise exception 'Usuario inválido'; end if;
 delete from public.pb_friendships where user_a=least(me,p_other) and user_b=greatest(me,p_other);
 -- Cancelar invitaciones pendientes entre quienes ya no son amigos.
 update public.pb_game_invitations set status='cancelled',responded_at=now()
 where status='pending' and ((inviter_id=me and invitee_id=p_other) or (inviter_id=p_other and invitee_id=me));
end;$$;

create or replace function public.pb_invitation_send(p_invitee uuid,p_room_code text,p_battle_mode text,p_ranked boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid:=auth.uid(); invite_id uuid;
begin
 if me is null then raise exception 'Debes iniciar sesión'; end if;
 if p_invitee is null or p_invitee=me or p_room_code !~ '^[A-Z0-9]{6}$'
   or p_battle_mode not in ('1V1','2V2','FREE_FOR_ALL') or p_ranked is null then
   raise exception 'Invitación inválida'; end if;
 if not exists(select 1 from public.pb_friendships
   where user_a=least(me,p_invitee) and user_b=greatest(me,p_invitee) and status='accepted') then
   raise exception 'Solo puedes invitar a tus amigos'; end if;
 -- Nunca permitir inundar un buzón. Invites expiradas no cuentan.
 if (select count(*) from public.pb_game_invitations where inviter_id=me
     and created_at > now()-interval '10 minutes')>=20 then
     raise exception 'Demasiadas invitaciones. Prueba más tarde';end if;
 select id into invite_id from public.pb_game_invitations
   where inviter_id=me and invitee_id=p_invitee and room_code=p_room_code;
 if invite_id is not null then return invite_id; end if;
 insert into public.pb_game_invitations(inviter_id,invitee_id,room_code,battle_mode,ranked)
 values(me,p_invitee,p_room_code,p_battle_mode,p_ranked) returning id into invite_id;
 return invite_id;
end;$$;

create or replace function public.pb_invitation_reply(p_invitation uuid,p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid:=auth.uid(); row_ public.pb_game_invitations%rowtype;
begin
 if me is null then raise exception 'Debes iniciar sesión';end if;
 select * into row_ from public.pb_game_invitations where id=p_invitation for update;
 if row_.id is null or row_.invitee_id<>me then raise exception 'Invitación no encontrada';end if;
 -- Unirse a una sala no garantiza que aún haya hueco. Permitir repetir la entrada tras fallo temporal.
 if row_.status='accepted' and p_accept and row_.expires_at>now() then return; end if;
 if row_.status<>'pending' or row_.expires_at<=now() then raise exception 'La invitación ha caducado';end if;
 update public.pb_game_invitations set status=case when p_accept then 'accepted' else 'declined' end,
   responded_at=now() where id=p_invitation;
end;$$;

create or replace function public.pb_invitation_cancel(p_invitation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid:=auth.uid();
begin
 if me is null then raise exception 'Debes iniciar sesión'; end if;
 update public.pb_game_invitations set status='cancelled',responded_at=now()
 where id=p_invitation and inviter_id=me and status='pending';
end;$$;

revoke all on function public.pb_friend_request(text),public.pb_friend_reply(uuid,boolean),public.pb_friend_remove(uuid),
 public.pb_invitation_send(uuid,text,text,boolean),public.pb_invitation_reply(uuid,boolean),public.pb_invitation_cancel(uuid)
 from public,anon,authenticated;
grant execute on function public.pb_friend_request(text),public.pb_friend_reply(uuid,boolean),public.pb_friend_remove(uuid),
 public.pb_invitation_send(uuid,text,text,boolean),public.pb_invitation_reply(uuid,boolean),public.pb_invitation_cancel(uuid)
 to authenticated;

-- Realtime opcional: Postgres Changes con RLS; sigue funcionando por consulta periódica sin Realtime.
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='pb_friendships') then
     alter publication supabase_realtime add table public.pb_friendships;
   end if;
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='pb_game_invitations') then
     alter publication supabase_realtime add table public.pb_game_invitations;
   end if;
 end if;
end$$;
