-- PHOTO BRAWL V29 · Admin solo lectura: todos los luchadores en la nube.
-- Ejecutar en el SQL Editor de Supabase como propietario de la base de datos.
-- La cuenta autorizada queda fijada por auth.users.id, NUNCA por un username
-- comprobado en cada petición (los usernames se pueden modificar).
-- Si @guzmangriancho aún no existe, crea la cuenta primero y vuelve a
-- ejecutar ESTA migración; el acceso no se asigna automáticamente a futuros registros.

create schema if not exists photo_brawl_internal;
revoke all on schema photo_brawl_internal from public, anon, authenticated;

create table if not exists photo_brawl_internal.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' unique check (role = 'owner'),
  assigned_at timestamptz not null default now()
);
revoke all on photo_brawl_internal.admin_users from public, anon, authenticated;
alter table photo_brawl_internal.admin_users enable row level security;

-- Designación única e idempotente: solo al ejecutar este SQL con la cuenta
-- ya registrada; no se transfiere el rol si el nombre cambia de propietario.
insert into photo_brawl_internal.admin_users (user_id)
select id from public.player_profiles
where username = 'guzmangriancho'
  and not exists (select 1 from photo_brawl_internal.admin_users)
on conflict do nothing;

-- No aceptar IDs, nombres ni parámetros enviados por el frontend.
create or replace function public.pb_is_admin()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from photo_brawl_internal.admin_users
    where user_id = (select auth.uid())
  );
$$;
revoke all on function public.pb_is_admin() from public, anon, authenticated;
grant execute on function public.pb_is_admin() to authenticated;

-- En RLS, la lectura global es exclusiva para el admin. Las políticas de
-- modificación siguen limitadas al owner_id: jamás se concede escritura ajena.
drop policy if exists "Admin puede consultar luchadores privados" on public.fighters;
create policy "Admin puede consultar luchadores privados"
on public.fighters for select to authenticated
using ((select public.pb_is_admin()));

-- Los retratos y sprites privados se descargan con JWT autenticado, nunca se
-- hacen públicos ni se copian al bucket 'fighter-public'.
drop policy if exists "Admin puede descargar arte privado" on storage.objects;
create policy "Admin puede descargar arte privado"
on storage.objects for select to authenticated
using (bucket_id = 'fighter-private' and (select public.pb_is_admin()));

-- Comprobación desde SQL Editor (no devuelve datos de usuarios al cliente):
-- select p.username, a.user_id from photo_brawl_internal.admin_users a
-- join public.player_profiles p on p.id = a.user_id;
