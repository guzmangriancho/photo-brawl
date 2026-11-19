-- PHOTO BRAWL V51: ligas y progresión server-authoritative, SIN resetear el ELO global.
-- Aplicar DESPUÉS de 202611180004_group_ranked_elo.sql y ANTES de desplegar Render V51.
-- El servidor (service_role / sb_secret_) es el único que puede otorgar copas.
-- Reejecutable. Las partidas anteriores conservan ELO; no se inventan copas históricas
-- porque los resultados V50 no guardaban las identidades de los luchadores usados.

create table if not exists public.fighter_progress (
 fighter_id uuid primary key references public.fighters(id) on delete cascade,
 account_id uuid not null references public.player_profiles(id) on delete cascade,
 trophies integer not null default 0 check (trophies>=0),
 best_trophies integer not null default 0 check (best_trophies>=trophies),
 wins integer not null default 0 check (wins>=0),
 losses integer not null default 0 check (losses>=0),
 played integer not null default 0 check (played>=wins+losses),
 updated_at timestamptz not null default now()
);
create index if not exists fighter_progress_rank_idx on public.fighter_progress(trophies desc,wins desc);
create index if not exists fighter_progress_account_idx on public.fighter_progress(account_id,trophies desc);

create table if not exists public.duo_progress (
 player_a uuid not null references public.player_profiles(id) on delete cascade,
 player_b uuid not null references public.player_profiles(id) on delete cascade,
 trophies integer not null default 0 check(trophies>=0),
 best_trophies integer not null default 0 check(best_trophies>=trophies),
 wins integer not null default 0 check(wins>=0),
 losses integer not null default 0 check(losses>=0),
 played integer not null default 0 check(played>=wins+losses),
 updated_at timestamptz not null default now(),
 primary key(player_a,player_b),
 constraint canonical_duo_order check(player_a<player_b)
);
create index if not exists duo_progress_rank_idx on public.duo_progress(trophies desc,wins desc);
create index if not exists duo_progress_second_player_idx on public.duo_progress(player_b);

-- Ledger: trazabilidad por partida, inmutable para clientes, preservado si se borra un luchador.
create table if not exists public.fighter_progress_events (
 match_id uuid not null,
 account_id uuid not null references public.player_profiles(id) on delete cascade,
 fighter_id uuid references public.fighters(id) on delete set null,
 mode text not null check(mode in ('1V1','2V2','FREE_FOR_ALL')),
 placement smallint not null,
 before_trophies integer not null,
 change integer not null,
 rotation_bonus integer not null default 0,
 after_trophies integer not null,
 won boolean not null,
 played_at timestamptz not null default now(),
 primary key(match_id,account_id)
);
create index if not exists fighter_progress_events_rotation_idx on public.fighter_progress_events(account_id,played_at desc);
create table if not exists public.duo_progress_events (
 match_id uuid not null,
 player_a uuid not null references public.player_profiles(id) on delete cascade,
 player_b uuid not null references public.player_profiles(id) on delete cascade,
 before_trophies integer not null,
 change integer not null,
 after_trophies integer not null,
 won boolean not null,
 played_at timestamptz not null default now(),
 primary key(match_id,player_a,player_b)
);

alter table public.fighter_progress enable row level security;
alter table public.duo_progress enable row level security;
alter table public.fighter_progress_events enable row level security;
alter table public.duo_progress_events enable row level security;
revoke all on public.fighter_progress,public.duo_progress,public.fighter_progress_events,public.duo_progress_events from public,anon,authenticated;
grant select on public.fighter_progress,public.duo_progress to authenticated;
-- No exponer fichas privadas: solo su propietario puede ver sus copas; la comunidad ve únicamente las publicadas.
drop policy if exists "Copas propias o luchador publicado" on public.fighter_progress;
create policy "Copas propias o luchador publicado" on public.fighter_progress
 for select to authenticated using(exists(select 1 from public.fighters f
  where f.id=fighter_id and f.owner_id=account_id and (f.is_public or f.owner_id=(select auth.uid()))));
drop policy if exists "Clasificacion de parejas" on public.duo_progress;
create policy "Clasificacion de parejas" on public.duo_progress for select to authenticated using(true);
-- Deliberadamente sin políticas de lectura pública para logs ni de escritura de copas.

create or replace function public.pb_league(p_cups integer)
returns text language sql immutable set search_path='' as $$
 select case when p_cups>=1600 then 'LEYENDA' when p_cups>=1000 then 'MAESTRO'
  when p_cups>=600 then 'DIAMANTE' when p_cups>=300 then 'ORO'
  when p_cups>=100 then 'PLATA' else 'BRONCE' end;
$$;
-- p_place: 1 ganador, 2 perdedor; FFA: posiciones 1,2,3,4; 0 empate 2v2.
create or replace function public.pb_cup_delta(p_cups integer,p_place integer,p_mode text)
returns integer language sql immutable set search_path='' as $$
 select case when p_place=0 then 0
  when p_mode='FREE_FOR_ALL' then
   case when p_place=1 then case when p_cups<300 then 22 when p_cups<1000 then 16 else 12 end
        when p_place=2 then case when p_cups<600 then 8 else 4 end
        when p_place=3 then case when p_cups<100 then 0 when p_cups<600 then -6 else -10 end
        else case when p_cups<100 then 0 when p_cups<600 then -10 else -18 end end
  when p_place=1 then case when p_cups<100 then 26 when p_cups<300 then 22
     when p_cups<600 then 18 when p_cups<1000 then 14 when p_cups<1600 then 11 else 9 end
  else case when p_cups<100 then 0 when p_cups<300 then -5 when p_cups<600 then -9
     when p_cups<1000 then -13 when p_cups<1600 then -16 else -20 end end;
$$;

-- Primera victoria clasificatoria del día UTC con un luchador distinto (máximo tres).
-- Premio moderado, no cuenta amistosas ni CPU, no se puede reclamar varias veces.
create or replace function public.pb_rotation_bonus(p_account uuid,p_fighter uuid)
returns integer language sql stable set search_path='' as $$
 select case when exists(select 1 from public.fighter_progress_events e where e.account_id=p_account
     and e.fighter_id=p_fighter and e.won and e.played_at>=date_trunc('day',now(),'UTC')) then 0
   when (select count(distinct e.fighter_id) from public.fighter_progress_events e
     where e.account_id=p_account and e.won and e.played_at>=date_trunc('day',now(),'UTC')) >= 3 then 0
   else 5 end;
$$;

-- Un regalo/cambio de propietario no debe transferir copas logradas por la cuenta anterior.
create or replace function public.pb_reset_transferred_fighter_progress()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.owner_id is distinct from old.owner_id then
   delete from public.fighter_progress where fighter_id=new.id;
 end if;
 return new;
end;
$$;
drop trigger if exists pb_reset_transferred_progress on public.fighters;
create trigger pb_reset_transferred_progress after update of owner_id on public.fighters
 for each row execute function public.pb_reset_transferred_fighter_progress();

-- Reúne el cálculo de un luchador en un solo lugar; ejecutable solo desde RPCs de servidor.
create or replace function public.pb_award_fighter(
 p_match uuid,p_account uuid,p_local_id text,p_mode text,p_place integer
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 fid uuid; old_cups integer; new_cups integer; shift integer; bonus integer;
begin
 if p_account is null or p_local_id is null or length(p_local_id)>100 or
    p_mode not in ('1V1','2V2','FREE_FOR_ALL') or p_place not between 0 and 4 then
    raise exception 'Datos inválidos de progresión';
 end if;
 select id into fid from public.fighters where owner_id=p_account and local_id=p_local_id for share;
 if fid is null then raise exception 'El luchador clasificado no pertenece a la cuenta'; end if;
 insert into public.fighter_progress(fighter_id,account_id) values(fid,p_account)
  on conflict(fighter_id) do nothing;
 select trophies into old_cups from public.fighter_progress
  where fighter_id=fid and account_id=p_account for update;
 if old_cups is null then raise exception 'La propiedad del luchador cambió'; end if;
 bonus:=case when p_place=1 then public.pb_rotation_bonus(p_account,fid) else 0 end;
 shift:=public.pb_cup_delta(old_cups,p_place,p_mode)+bonus;
 new_cups:=greatest(0,old_cups+shift);
 update public.fighter_progress set trophies=new_cups,
  best_trophies=greatest(best_trophies,new_cups),played=played+1,
  wins=wins+(case when p_place=1 then 1 else 0 end),
  losses=losses+(case when p_place>1 and (p_mode<>'FREE_FOR_ALL' or p_place>=3) then 1 else 0 end),
  updated_at=now() where fighter_id=fid;
 insert into public.fighter_progress_events(match_id,account_id,fighter_id,mode,placement,
  before_trophies,change,rotation_bonus,after_trophies,won)
 values(p_match,p_account,fid,p_mode,p_place,old_cups,new_cups-old_cups,bonus,new_cups,p_place=1);
 return jsonb_build_object('fighter_id',fid,'before',old_cups,'after',new_cups,
  'change',new_cups-old_cups,'rotation_bonus',bonus,'league',public.pb_league(new_cups));
end;
$$;

-- El RPC antiguo sigue llevando TODO el ELO, historial y lógica de revancha.
-- Esta función lo envuelve en la MISMA TRANSACCIÓN: si falla la entrega de copas,
-- también se revierte la actualización ELO. No hay doble contabilización.
create or replace function public.record_ranked_progress_match(
 p_match_id uuid,p_host_id uuid,p_guest_id uuid,p_host_rounds integer,
 p_guest_rounds integer,p_stage text,p_host_fighter_local_id text,
 p_guest_fighter_local_id text,p_result_type text default 'played'
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare answer jsonb; host_badge jsonb; guest_badge jsonb;
begin
 if p_match_id is null or p_host_id is null or p_guest_id is null or p_host_id=p_guest_id then
  raise exception 'Participantes inválidos'; end if;
 -- Comprobación ANTES de mutar el ELO: los ID de luchador pertenecen a las dos cuentas.
 if not exists(select 1 from public.fighters where owner_id=p_host_id and local_id=p_host_fighter_local_id)
 or not exists(select 1 from public.fighters where owner_id=p_guest_id and local_id=p_guest_fighter_local_id)
 then raise exception 'Se exige un luchador propio sincronizado'; end if;
 answer:=public.record_ranked_match(p_match_id,p_host_id,p_guest_id,p_host_rounds,p_guest_rounds,p_stage,p_result_type);
 if coalesce((answer->>'recorded')::boolean,false)=false then return answer; end if;
 -- Orden estable por account_id; las cuentas ya están bloqueadas en record_ranked_match.
 if p_host_id<p_guest_id then
  host_badge:=public.pb_award_fighter(p_match_id,p_host_id,p_host_fighter_local_id,'1V1',case when p_host_rounds=2 then 1 else 2 end);
  guest_badge:=public.pb_award_fighter(p_match_id,p_guest_id,p_guest_fighter_local_id,'1V1',case when p_guest_rounds=2 then 1 else 2 end);
 else
  guest_badge:=public.pb_award_fighter(p_match_id,p_guest_id,p_guest_fighter_local_id,'1V1',case when p_guest_rounds=2 then 1 else 2 end);
  host_badge:=public.pb_award_fighter(p_match_id,p_host_id,p_host_fighter_local_id,'1V1',case when p_host_rounds=2 then 1 else 2 end);
 end if;
 return answer||jsonb_build_object('host_fighter',host_badge,'guest_fighter',guest_badge);
end;
$$;

create or replace function public.pb_award_duo(p_match uuid,p_user_1 uuid,p_user_2 uuid,p_place integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a uuid; b uuid; old_cups integer; after_cups integer; shift integer;
begin
 if p_user_1=p_user_2 or p_user_1 is null or p_user_2 is null then raise exception 'Dúo inválido'; end if;
 a:=least(p_user_1,p_user_2); b:=greatest(p_user_1,p_user_2);
 insert into public.duo_progress(player_a,player_b) values(a,b) on conflict do nothing;
 select trophies into old_cups from public.duo_progress where player_a=a and player_b=b for update;
 shift:=case when p_place=0 then 0 else public.pb_cup_delta(old_cups,p_place,'2V2') end;
 after_cups:=greatest(0,old_cups+shift);
 update public.duo_progress set trophies=after_cups,best_trophies=greatest(best_trophies,after_cups),
  wins=wins+(case when p_place=1 then 1 else 0 end),
  losses=losses+(case when p_place=2 then 1 else 0 end),
  played=played+1,updated_at=now() where player_a=a and player_b=b;
 insert into public.duo_progress_events(match_id,player_a,player_b,before_trophies,change,after_trophies,won)
 values(p_match,a,b,old_cups,after_cups-old_cups,after_cups,p_place=1);
 return jsonb_build_object('player_a',a,'player_b',b,'before',old_cups,'after',after_cups,
  'change',after_cups-old_cups,'league',public.pb_league(after_cups));
end;
$$;

create or replace function public.record_group_ranked_progress_match(
 p_match_id uuid,p_mode text,p_player_ids uuid[],p_places integer[],p_stage text,
 p_fighter_local_ids text[],p_winning_team text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare answer jsonb; i integer; badge jsonb; badges jsonb:='[]'::jsonb;
  red_badge jsonb; blue_badge jsonb; duos jsonb:='[]'::jsonb; place integer; first_count integer;
begin
 if p_match_id is null or p_mode not in ('2V2','FREE_FOR_ALL') or
    coalesce(array_length(p_fighter_local_ids,1),0)<>4 or
    coalesce(array_length(p_player_ids,1),0)<>4 or
    exists(select 1 from unnest(p_fighter_local_ids) v(id) where v.id is null or length(v.id)>100) then
    raise exception 'Plantilla de luchadores inválida'; end if;
 for i in 1..4 loop
  if not exists(select 1 from public.fighters where owner_id=p_player_ids[i] and local_id=p_fighter_local_ids[i]) then
    raise exception 'Todos los luchadores deben pertenecer a su cuenta'; end if;
 end loop;
 -- La RPC V39 ya impide repetir match_id y verifica los cuatro jugadores y sus posiciones.
 answer:=public.record_group_ranked_match(p_match_id,p_mode,p_player_ids,p_places,p_stage,p_winning_team);
 if coalesce((answer->>'recorded')::boolean,false)=false then return answer; end if;
 -- FFA con empate en el primer puesto: ELO puntúa un empate, por tanto
 -- nadie cobra la recompensa íntegra de ganador ni el bonus de rotación.
 select count(*) into first_count from unnest(p_places) as pos(place) where pos.place=1;
 -- Asigna copas a todos los luchadores usados, NO a los suplentes o al roster local.
 for i in 1..4 loop
  place:=case when p_mode='2V2' then
    case when p_winning_team is null then 0 when (i%2=1 and p_winning_team='RED') or
      (i%2=0 and p_winning_team='BLUE') then 1 else 2 end
   else case when p_places[i]=1 and first_count<>1 then 0 else p_places[i] end end;
  badge:=public.pb_award_fighter(p_match_id,p_player_ids[i],p_fighter_local_ids[i],p_mode,place);
  badges:=badges||jsonb_build_array(badge||jsonb_build_object('seat',i-1));
 end loop;
 if p_mode='2V2' then
   red_badge:=public.pb_award_duo(p_match_id,p_player_ids[1],p_player_ids[3],
      case when p_winning_team is null then 0 when p_winning_team='RED' then 1 else 2 end);
   blue_badge:=public.pb_award_duo(p_match_id,p_player_ids[2],p_player_ids[4],
      case when p_winning_team is null then 0 when p_winning_team='BLUE' then 1 else 2 end);
   duos:=jsonb_build_array(red_badge||jsonb_build_object('team','RED'),
     blue_badge||jsonb_build_object('team','BLUE'));
 end if;
 return answer||jsonb_build_object('fighters',badges,'duos',duos);
end;
$$;

revoke all on function public.pb_award_fighter(uuid,uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.pb_award_duo(uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.pb_rotation_bonus(uuid,uuid) from public,anon,authenticated;
revoke all on function public.record_ranked_progress_match(uuid,uuid,uuid,integer,integer,text,text,text,text) from public,anon,authenticated;
revoke all on function public.record_group_ranked_progress_match(uuid,text,uuid[],integer[],text,text[],text) from public,anon,authenticated;
grant execute on function public.pb_award_fighter(uuid,uuid,text,text,integer) to service_role;
grant execute on function public.pb_award_duo(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.pb_rotation_bonus(uuid,uuid) to service_role;
grant execute on function public.record_ranked_progress_match(uuid,uuid,uuid,integer,integer,text,text,text,text) to service_role;
grant execute on function public.record_group_ranked_progress_match(uuid,text,uuid[],integer[],text,text[],text) to service_role;
grant execute on function public.pb_league(integer) to authenticated;
grant execute on function public.pb_cup_delta(integer,integer,text) to service_role;
