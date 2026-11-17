-- PHOTO BRAWL V16 · cuentas, colección privada, comunidad y ranking verificado.
-- Ejecuta el archivo completo en SQL Editor. Es reejecutable: no borra tablas ni datos; solo vuelve a crear las políticas de acceso.
-- Las imágenes originales de las fotos NO se suben; solo se guardan artes finales.

create table if not exists public.player_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default 'JUGADOR' check (char_length(display_name) between 1 and 32),
  bio text not null default '' check (char_length(bio) <= 180),
  rating integer not null default 1000 check (rating >= 100),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists player_profiles_rank_idx on public.player_profiles (rating desc, wins desc);

create or replace function public.create_player_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.player_profiles(id, username, display_name)
  values (new.id, 'player_' || replace(left(new.id::text, 12), '-', ''), 'JUGADOR')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists after_auth_user_created on auth.users;
create trigger after_auth_user_created after insert on auth.users
for each row execute function public.create_player_profile();
-- Usuarios existentes, por si la migración se aplica después de algunas altas.
insert into public.player_profiles(id,username,display_name)
select id, 'player_' || replace(left(id::text, 12), '-', ''), 'JUGADOR'
from auth.users on conflict (id) do nothing;

create table if not exists public.fighters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.player_profiles(id) on delete cascade,
  local_id text not null check (char_length(local_id) between 1 and 100),
  fighter_name text not null check (char_length(fighter_name) between 1 and 40),
  archetype text not null,
  fighter_data jsonb not null check (jsonb_typeof(fighter_data) = 'object' and pg_column_size(fighter_data) < 32000),
  private_portrait_path text not null,
  private_sheet_path text not null,
  public_portrait_path text,
  public_sheet_path text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,local_id),
  constraint must_have_public_assets check (not is_public or (public_portrait_path is not null and public_sheet_path is not null)),
  constraint private_asset_ownership check (
    left(private_portrait_path, length(owner_id::text)+1) = owner_id::text || '/' and
    left(private_sheet_path, length(owner_id::text)+1) = owner_id::text || '/'),
  constraint public_asset_ownership check (
    (public_portrait_path is null or left(public_portrait_path,length(owner_id::text)+1)=owner_id::text || '/') and
    (public_sheet_path is null or left(public_sheet_path,length(owner_id::text)+1)=owner_id::text || '/')
  )
);
create index if not exists fighters_owner_idx on public.fighters(owner_id,created_at desc);
create index if not exists fighters_public_idx on public.fighters(created_at desc) where is_public;
create index if not exists fighters_search_idx on public.fighters(lower(fighter_name)) where is_public;

create table if not exists public.fighter_likes (
  fighter_id uuid not null references public.fighters(id) on delete cascade,
  user_id uuid not null references public.player_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(fighter_id,user_id)
);
create index if not exists fighter_likes_user_idx on public.fighter_likes(user_id);

create table if not exists public.ranked_matches (
  match_id uuid primary key,
  host_id uuid not null references public.player_profiles(id) on delete cascade,
  guest_id uuid not null references public.player_profiles(id) on delete cascade,
  winner_id uuid not null references public.player_profiles(id) on delete cascade,
  host_rounds smallint not null check (host_rounds between 0 and 2),
  guest_rounds smallint not null check (guest_rounds between 0 and 2),
  stage_id text not null,
  result_type text not null default 'played' check (result_type in ('played','forfeit')),
  host_rating_before integer not null,
  guest_rating_before integer not null,
  host_rating_after integer not null,
  guest_rating_after integer not null,
  played_at timestamptz not null default now(),
  check (host_id <> guest_id),
  check (winner_id = host_id or winner_id = guest_id),
  check ((host_rounds=2 and guest_rounds<2 and winner_id=host_id) or (guest_rounds=2 and host_rounds<2 and winner_id=guest_id))
);
create index if not exists ranked_matches_pair_idx on public.ranked_matches(host_id,guest_id,played_at desc);

-- Ningún cliente puede escribir rating, victorias ni resultados.
alter table public.player_profiles enable row level security;
alter table public.fighters enable row level security;
alter table public.fighter_likes enable row level security;
alter table public.ranked_matches enable row level security;
revoke all on public.player_profiles,public.fighters,public.fighter_likes,public.ranked_matches from anon,authenticated;
grant select on public.player_profiles to anon,authenticated;
grant update (username,display_name,bio) on public.player_profiles to authenticated;
grant select on public.fighters to anon,authenticated;
grant insert,update,delete on public.fighters to authenticated;
grant select on public.fighter_likes to anon,authenticated;
grant insert,delete on public.fighter_likes to authenticated;
-- ranked_matches: accesible SOLO para el servidor con credencial secreta.

drop policy if exists "Perfiles públicos" on public.player_profiles;
create policy "Perfiles públicos" on public.player_profiles for select to anon,authenticated using (true);
drop policy if exists "Editar mi perfil sin tocar ranking" on public.player_profiles;
create policy "Editar mi perfil sin tocar ranking" on public.player_profiles for update to authenticated
  using (id=(select auth.uid())) with check (id=(select auth.uid()));
drop policy if exists "Ver luchadores propios o publicados" on public.fighters;
create policy "Ver luchadores propios o publicados" on public.fighters for select to anon,authenticated
  using (is_public or owner_id=(select auth.uid()));
drop policy if exists "Subir luchador propio" on public.fighters;
create policy "Subir luchador propio" on public.fighters for insert to authenticated
  with check (owner_id=(select auth.uid()));
drop policy if exists "Editar luchador propio" on public.fighters;
create policy "Editar luchador propio" on public.fighters for update to authenticated
  using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
drop policy if exists "Eliminar luchador propio" on public.fighters;
create policy "Eliminar luchador propio" on public.fighters for delete to authenticated
  using (owner_id=(select auth.uid()));
drop policy if exists "Ver me gusta de personajes publicados o propios" on public.fighter_likes;
create policy "Ver me gusta de personajes publicados o propios" on public.fighter_likes for select to anon,authenticated
  using (exists (select 1 from public.fighters f where f.id=fighter_id and (f.is_public or f.owner_id=(select auth.uid()))));
drop policy if exists "Me gusta solo publicados y nunca propios" on public.fighter_likes;
create policy "Me gusta solo publicados y nunca propios" on public.fighter_likes for insert to authenticated
  with check (user_id=(select auth.uid()) and exists (select 1 from public.fighters f where f.id=fighter_id and f.is_public and f.owner_id<>user_id));
drop policy if exists "Quitar mi me gusta" on public.fighter_likes;
create policy "Quitar mi me gusta" on public.fighter_likes for delete to authenticated
  using (user_id=(select auth.uid()));

-- Storage: privado para sincronización entre dispositivos; público SOLO tras consentimiento.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('fighter-private','fighter-private',false,5242880,array['image/png','image/webp','image/jpeg'])
on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('fighter-public','fighter-public',true,5242880,array['image/png','image/webp','image/jpeg'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Leer mis archivos privados" on storage.objects;
create policy "Leer mis archivos privados" on storage.objects for select to authenticated
  using (bucket_id='fighter-private' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Subir mis archivos privados" on storage.objects;
create policy "Subir mis archivos privados" on storage.objects for insert to authenticated
  with check (bucket_id='fighter-private' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Actualizar mis archivos privados" on storage.objects;
create policy "Actualizar mis archivos privados" on storage.objects for update to authenticated
  using (bucket_id='fighter-private' and (storage.foldername(name))[1]=(select auth.uid())::text)
  with check (bucket_id='fighter-private' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Borrar mis archivos privados" on storage.objects;
create policy "Borrar mis archivos privados" on storage.objects for delete to authenticated
  using (bucket_id='fighter-private' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Consultar mis archivos públicos" on storage.objects;
create policy "Consultar mis archivos públicos" on storage.objects for select to authenticated
  using (bucket_id='fighter-public' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Subir arte público propio" on storage.objects;
create policy "Subir arte público propio" on storage.objects for insert to authenticated
  with check (bucket_id='fighter-public' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Actualizar arte público propio" on storage.objects;
create policy "Actualizar arte público propio" on storage.objects for update to authenticated
  using (bucket_id='fighter-public' and (storage.foldername(name))[1]=(select auth.uid())::text)
  with check (bucket_id='fighter-public' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Borrar arte público propio" on storage.objects;
create policy "Borrar arte público propio" on storage.objects for delete to authenticated
  using (bucket_id='fighter-public' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Llamado únicamente desde Render con SUPABASE_SECRET_KEY / service_role.
-- Función de una sola transacción: idempotente; limita abusos entre la misma pareja a 1 resultado puntuable/24 h.
create or replace function public.record_ranked_match(
  p_match_id uuid,p_host_id uuid,p_guest_id uuid,p_host_rounds integer,p_guest_rounds integer,p_stage text,p_result_type text default 'played'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  host_record public.player_profiles%rowtype;
  guest_record public.player_profiles%rowtype;
  old_host integer;
  old_guest integer;
  expected_host double precision;
  delta integer;
  new_host integer;
  new_guest integer;
  winner uuid;
begin
  if p_result_type not in ('played','forfeit') or p_host_id = p_guest_id or p_host_id is null or p_guest_id is null or
     not ((p_host_rounds = 2 and p_guest_rounds between 0 and 1) or
          (p_guest_rounds = 2 and p_host_rounds between 0 and 1)) then
    raise exception 'Marcador o jugadores no válidos';
  end if;
  -- Orden estable para evitar deadlocks en partidas simultáneas.
  perform 1 from public.player_profiles where id in (p_host_id,p_guest_id) order by id for update;
  select * into host_record from public.player_profiles where id=p_host_id;
  select * into guest_record from public.player_profiles where id=p_guest_id;
  if host_record.id is null or guest_record.id is null then raise exception 'Cuentas no encontradas'; end if;
  if exists(select 1 from public.ranked_matches where match_id=p_match_id) then
    return jsonb_build_object('recorded',false,'reason','duplicate');
  end if;
  if exists(select 1 from public.ranked_matches
    where ((host_id=p_host_id and guest_id=p_guest_id) or (host_id=p_guest_id and guest_id=p_host_id))
    and played_at > now() - interval '24 hours') then
    return jsonb_build_object('recorded',false,'reason','same_opponent_cooldown');
  end if;
  old_host:=host_record.rating; old_guest:=guest_record.rating;
  expected_host:=1.0 / (1.0 + power(10.0,(old_guest-old_host)::double precision/400.0));
  delta:=round(32.0*((case when p_host_rounds=2 then 1 else 0 end)-expected_host));
  new_host:=greatest(100,old_host+delta); new_guest:=greatest(100,old_guest-delta);
  winner:=case when p_host_rounds=2 then p_host_id else p_guest_id end;
  insert into public.ranked_matches(match_id,host_id,guest_id,winner_id,host_rounds,guest_rounds,stage_id,result_type,
      host_rating_before,guest_rating_before,host_rating_after,guest_rating_after)
  values (p_match_id,p_host_id,p_guest_id,winner,p_host_rounds,p_guest_rounds,p_stage,p_result_type,
      old_host,old_guest,new_host,new_guest);
  update public.player_profiles set rating=new_host,wins=wins+(case when winner=p_host_id then 1 else 0 end),
      losses=losses+(case when winner=p_guest_id then 1 else 0 end),updated_at=now() where id=p_host_id;
  update public.player_profiles set rating=new_guest,wins=wins+(case when winner=p_guest_id then 1 else 0 end),
      losses=losses+(case when winner=p_host_id then 1 else 0 end),updated_at=now() where id=p_guest_id;
  return jsonb_build_object('recorded',true,'winner_id',winner,'host_rating',new_host,'guest_rating',new_guest);
end;
$$;
revoke all on function public.record_ranked_match(uuid,uuid,uuid,integer,integer,text,text) from public,anon,authenticated;
grant execute on function public.record_ranked_match(uuid,uuid,uuid,integer,integer,text,text) to service_role;
revoke all on function public.create_player_profile() from public,anon,authenticated;
