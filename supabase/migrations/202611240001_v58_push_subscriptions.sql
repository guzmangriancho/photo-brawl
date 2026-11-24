-- PHOTO BRAWL V58 · Suscripciones Web Push para avisos sociales (solicitud de amistad,
-- invitación a combate e invitación aceptada). Requiere V56. Ejecutar una vez en SQL Editor.
-- El navegador NUNCA escribe suscripciones: las guarda/borra el servidor Render con la
-- clave secreta tras verificar el JWT del jugador. El cliente solo lee las suyas.

create table if not exists public.pb_push_subscriptions (
 endpoint text primary key check (char_length(endpoint) between 30 and 2048 and endpoint ~ '^https://'),
 user_id uuid not null references public.player_profiles(id) on delete cascade,
 p256dh text not null check (char_length(p256dh) between 20 and 200),
 auth text not null check (char_length(auth) between 10 and 100),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists pb_push_subs_user_idx on public.pb_push_subscriptions(user_id);

alter table public.pb_push_subscriptions enable row level security;
revoke all on public.pb_push_subscriptions from public, anon, authenticated;
grant select on public.pb_push_subscriptions to authenticated;

drop policy if exists "v58_push_own_read" on public.pb_push_subscriptions;
create policy "v58_push_own_read" on public.pb_push_subscriptions for select to authenticated
 using ((select auth.uid()) = user_id);

-- Sin INSERT/UPDATE/DELETE para authenticated y sin RPC: solo el rol de servicio (Render)
-- modifica suscripciones. Las bajas de endpoints caducados (404/410) también las hace Render.
