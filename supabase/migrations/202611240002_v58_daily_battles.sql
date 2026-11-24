-- PHOTO BRAWL V58 · Combate diario contra un luchador de la comunidad que rota cada día UTC.
-- Requiere V51/V55/V56. Ejecutar una vez en SQL Editor, después de las migraciones previas.
-- Sin ELO, sin copas, sin rachas: solo registro cosmético de victorias del mes.
-- La selección del luchador y del escenario es determinista e igual para todos; el premio
-- diario lo valida y registra una función SECURITY DEFINER (un resultado por cuenta y día).

create table if not exists public.pb_daily_features (
 day date primary key,
 fighter_id uuid not null references public.fighters(id) on delete cascade,
 fighter_name text not null check (char_length(fighter_name) between 1 and 40),
 fighter_data jsonb not null check (jsonb_typeof(fighter_data) = 'object' and pg_column_size(fighter_data) < 32000),
 stage text not null check (stage in ('SKI_RESORT','NIGHT_PLAZA','SUMMER_SUMMIT','TEMPLE_SUNSET','INDUSTRIAL_ROOFTOP','SUNKEN_ATLANTIS','SPIRIT_FOREST','CELESTIAL_TEMPLE','VOLCANIC_FORTRESS')),
 public_portrait_path text,
 public_sheet_path text,
 created_at timestamptz not null default now()
);

create table if not exists public.pb_daily_results (
 account_id uuid not null references public.player_profiles(id) on delete cascade,
 day date not null references public.pb_daily_features(day) on delete cascade,
 won boolean not null,
 rounds_for integer not null check (rounds_for between 0 and 2),
 rounds_against integer not null check (rounds_against between 0 and 2),
 fighter_local_id text check (fighter_local_id is null or char_length(fighter_local_id) between 1 and 100),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(account_id,day),
 constraint pb_daily_score_coherent check ((won and rounds_for=2 and rounds_against between 0 and 1) or
   (not won and rounds_against=2 and rounds_for between 0 and 1))
);
create index if not exists pb_daily_results_month_idx on public.pb_daily_results(account_id,day desc);

alter table public.pb_daily_features enable row level security;
alter table public.pb_daily_results enable row level security;
revoke all on public.pb_daily_features, public.pb_daily_results from public, anon, authenticated;
grant select on public.pb_daily_features, public.pb_daily_results to authenticated;

-- El reto del día es público (solo luchadores publicados); los resultados solo los lee su dueño.
drop policy if exists "v58_daily_feature_read" on public.pb_daily_features;
create policy "v58_daily_feature_read" on public.pb_daily_features for select to authenticated using (true);
drop policy if exists "v58_daily_results_own_read" on public.pb_daily_results;
create policy "v58_daily_results_own_read" on public.pb_daily_results for select to authenticated
 using ((select auth.uid()) = account_id);

-- Devuelve el reto de hoy (materializándolo la primera vez) y mi progreso del mes.
-- Selección determinista: el orden por md5(id||día) es idéntico en cualquier llamada,
-- así todos los jugadores ven el mismo luchador y el mismo escenario ese día.
create or replace function public.pb_daily_today()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 me uuid := auth.uid();
 today date := (now() at time zone 'utc')::date;
 feature public.pb_daily_features%rowtype;
 stages constant text[] := array['SKI_RESORT','NIGHT_PLAZA','SUMMER_SUMMIT','TEMPLE_SUNSET','INDUSTRIAL_ROOFTOP','SUNKEN_ATLANTIS','SPIRIT_FOREST','CELESTIAL_TEMPLE','VOLCANIC_FORTRESS'];
 chosen record;
 my_result jsonb;
 month_wins integer;
 month_played integer;
begin
 if me is null then raise exception 'Debes iniciar sesión'; end if;
 select * into feature from public.pb_daily_features where day=today;
 if feature.day is null then
   -- Primer candidato del día: un luchador PUBLICADO cualquiera; el arte ya es público por diseño.
   select f.id,f.fighter_name,f.fighter_data,f.public_portrait_path,f.public_sheet_path into chosen
   from public.fighters f where f.is_public
   order by md5(f.id::text || today::text) limit 1;
   if chosen.id is null then
     return jsonb_build_object('available',false,'day',today);
   end if;
   insert into public.pb_daily_features(day,fighter_id,fighter_name,fighter_data,stage,public_portrait_path,public_sheet_path)
   values (today,chosen.id,chosen.fighter_name,chosen.fighter_data,
     stages[1 + abs(('x' || left(md5(chosen.id::text || today::text || 'escenario'), 8))::bit(32)::int % 9)],
     chosen.public_portrait_path,chosen.public_sheet_path)
   on conflict (day) do nothing;
   select * into feature from public.pb_daily_features where day=today;
 end if;
 select jsonb_build_object('won',r.won,'rounds_for',r.rounds_for,'rounds_against',r.rounds_against)
   into my_result from public.pb_daily_results r where r.account_id=me and r.day=today;
 select count(*) filter (where won), count(*) into month_wins, month_played
   from public.pb_daily_results
   where account_id=me and day >= date_trunc('month',today)::date and day <= today;
 return jsonb_build_object(
   'available',true,
   'day',feature.day,
   'fighter_name',feature.fighter_name,
   'fighter_data',feature.fighter_data,
   'stage',feature.stage,
   'public_portrait_path',feature.public_portrait_path,
   'public_sheet_path',feature.public_sheet_path,
   'my_result',my_result,
   'month_wins',coalesce(month_wins,0),
   'month_played',coalesce(month_played,0)
 );
end;$$;

-- Registra el resultado del combate diario. Un intento premiado por cuenta y día:
-- la primera victoria se queda; las derrotas pueden repetirse hasta ganar; una vez
-- ganado, el día queda cerrado y las revanchas no modifican nada.
create or replace function public.pb_daily_record(p_won boolean,p_rounds_for integer,p_rounds_against integer,p_fighter_local_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 me uuid := auth.uid();
 today date := (now() at time zone 'utc')::date;
 existing public.pb_daily_results%rowtype;
 month_wins integer;
begin
 if me is null then raise exception 'Debes iniciar sesión'; end if;
 if p_won is null or not ((p_won and p_rounds_for=2 and p_rounds_against between 0 and 1) or
     (not p_won and p_rounds_against=2 and p_rounds_for between 0 and 1)) then
   raise exception 'Resultado no válido';
 end if;
 -- Solo existe premio si el día tiene reto materializado.
 if not exists(select 1 from public.pb_daily_features where day=today) then
   raise exception 'Hoy no hay combate diario disponible';
 end if;
 select * into existing from public.pb_daily_results where account_id=me and day=today for update;
 if existing.account_id is not null then
   if existing.won then
     return jsonb_build_object('recorded',false,'reason','already_won','won',true);
   end if;
   if not p_won then
     return jsonb_build_object('recorded',false,'reason','already_lost','won',false);
   end if;
   update public.pb_daily_results set won=true,rounds_for=p_rounds_for,rounds_against=p_rounds_against,
     fighter_local_id=p_fighter_local_id,updated_at=now()
   where account_id=me and day=today;
 else
   insert into public.pb_daily_results(account_id,day,won,rounds_for,rounds_against,fighter_local_id)
   values(me,today,p_won,p_rounds_for,p_rounds_against,p_fighter_local_id);
 end if;
 select count(*) into month_wins from public.pb_daily_results
   where account_id=me and won and day >= date_trunc('month',today)::date and day <= today;
 return jsonb_build_object('recorded',true,'won',p_won,'month_wins',month_wins);
end;$$;

revoke all on function public.pb_daily_today(),public.pb_daily_record(boolean,integer,integer,text) from public,anon;
grant execute on function public.pb_daily_today(),public.pb_daily_record(boolean,integer,integer,text) to authenticated;

-- Realtime opcional, mismo patrón que V56.
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='pb_daily_results') then
     alter publication supabase_realtime add table public.pb_daily_results;
   end if;
 end if;
end$$;
