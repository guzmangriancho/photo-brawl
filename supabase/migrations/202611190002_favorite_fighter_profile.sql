-- PHOTO BRAWL V53 · Un luchador favorito por usuario y avatar 16-bit público.
-- Ejecutar DESPUÉS de 202611190001_progression_leagues_duos.sql.
-- Reejecutable. No publica luchadores privados, solo el retrato optativo.

alter table public.player_profiles
  add column if not exists favorite_fighter_id uuid references public.fighters(id) on delete set null,
  add column if not exists favorite_avatar_path text;

-- La imagen del avatar usa el bucket fighter-public existente, en una ruta
-- independiente de la publicación del luchador (ocultarlo no rompe el perfil).
-- Si alguien marca un luchador privado como favorito, SOLO el retrato es público.
create or replace function public.pb_validate_favorite_fighter()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.favorite_fighter_id is null) <> (new.favorite_avatar_path is null) then
    raise exception 'El favorito y el avatar deben establecerse o quitarse juntos';
  end if;
  if new.favorite_fighter_id is not null then
    if not exists (select 1 from public.fighters f where f.id = new.favorite_fighter_id and f.owner_id = new.id) then
      raise exception 'El luchador favorito debe pertenecer a esta cuenta';
    end if;
    if new.favorite_avatar_path !~ ('^' || new.id::text || '/avatars/[0-9a-f-]{36}\.(png|webp|jpeg)$') then
      raise exception 'Ruta no permitida para el avatar';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists pb_validate_favorite_fighter on public.player_profiles;
create trigger pb_validate_favorite_fighter
before insert or update of favorite_fighter_id,favorite_avatar_path on public.player_profiles
for each row execute function public.pb_validate_favorite_fighter();

-- En borrado o transferencia, deshacer la asociación sin borrar otros datos.
create or replace function public.pb_clear_favorite_on_fighter_departure()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id) then
    update public.player_profiles
      set favorite_fighter_id = null, favorite_avatar_path = null
      where id = old.owner_id and favorite_fighter_id = old.id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists pb_clear_favorite_on_fighter_departure on public.fighters;
create trigger pb_clear_favorite_on_fighter_departure
before delete or update of owner_id on public.fighters
for each row execute function public.pb_clear_favorite_on_fighter_departure();

-- El ranking ELO no cambia: se autoriza SOLO actualizar las dos columnas de favorito.
grant update (favorite_fighter_id,favorite_avatar_path) on public.player_profiles to authenticated;
revoke all on function public.pb_validate_favorite_fighter() from public,anon,authenticated;
revoke all on function public.pb_clear_favorite_on_fighter_departure() from public,anon,authenticated;
create index if not exists player_profiles_favorite_idx on public.player_profiles(favorite_fighter_id)
  where favorite_fighter_id is not null;
