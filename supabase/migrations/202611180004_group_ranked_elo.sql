-- PHOTO BRAWL V39 · ELO de cuatro jugadores, calculado de forma atómica por el servidor.
-- No modifica las partidas 1v1 ni el historial existente.
-- Ejecutar una sola vez en Supabase > SQL Editor antes de habilitar ELO en Render.
create table if not exists public.group_ranked_matches (
  match_id uuid primary key,
  mode text not null check (mode in ('2V2','FREE_FOR_ALL')),
  stage_id text not null,
  player_ids uuid[] not null,
  places integer[] not null,
  rating_before integer[] not null,
  rating_after integer[] not null,
  winning_team text check (winning_team in ('RED','BLUE')),
  played_at timestamptz not null default now(),
  check (array_length(player_ids,1)=4),
  check (array_length(places,1)=4)
);
create index if not exists group_ranked_matches_date_idx on public.group_ranked_matches(played_at desc);
alter table public.group_ranked_matches enable row level security;
revoke all on public.group_ranked_matches from public, anon, authenticated;
-- Los clientes nunca pueden insertar/editar resultados ni leer identidades ajenas en bruto.
-- El servidor con service_role es el único que ejecuta la RPC.

create or replace function public.record_group_ranked_match(
  p_match_id uuid,
  p_mode text,
  p_player_ids uuid[],
  p_places integer[],
  p_stage text,
  p_winning_team text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  old_r integer[] := array[0,0,0,0];
  new_r integer[] := array[0,0,0,0];
  i integer;
  j integer;
  actual double precision;
  expected double precision;
  sum_score double precision;
  rating_red double precision;
  rating_blue double precision;
  delta integer;
  pair_score double precision;
  scores jsonb := '[]'::jsonb;
  any_first_count integer;
begin
  if p_match_id is null or p_mode not in ('2V2','FREE_FOR_ALL') or
    p_stage not in ('SUNKEN_ATLANTIS','SPIRIT_FOREST','CELESTIAL_TEMPLE','VOLCANIC_FORTRESS') or
    coalesce(array_length(p_player_ids,1),0)<>4 or
    coalesce(array_length(p_places,1),0)<>4 or
    exists(select 1 from unnest(p_player_ids) as p(id) where p.id is null) or
    (select count(distinct id) from unnest(p_player_ids) as p(id))<>4 or
    exists(select 1 from unnest(p_places) as p(place) where p.place is null or p.place<1 or p.place>4) or
    p_places[1]<>1 and p_places[2]<>1 and p_places[3]<>1 and p_places[4]<>1 then
    raise exception 'Participantes o posiciones de clasificatoria no válidos';
  end if;

  if p_mode='2V2' then
    if (p_winning_team='RED' and p_places<>array[1,2,1,2]) or
       (p_winning_team='BLUE' and p_places<>array[2,1,2,1]) or
       (p_winning_team is null and p_places<>array[1,1,1,1]) or
       (p_winning_team is not null and p_winning_team not in ('RED','BLUE')) then
      raise exception 'Resultado de equipos incoherente';
    end if;
  elsif p_winning_team is not null then
    raise exception 'FFA no tiene equipos';
  end if;

  -- Bloqueo de participantes en orden fijo: no hay resultados duplicados ni carreras entre salas.
  perform 1 from public.player_profiles
    where id=any(p_player_ids) order by id for update;
  if (select count(*) from public.player_profiles where id=any(p_player_ids))<>4 then
    raise exception 'Los cuatro perfiles deben existir';
  end if;
  if exists(select 1 from public.group_ranked_matches where match_id=p_match_id) then
    return jsonb_build_object('recorded',false,'reason','duplicate');
  end if;
  for i in 1..4 loop
    select rating into old_r[i] from public.player_profiles where id=p_player_ids[i];
    new_r[i] := old_r[i];
  end loop;

  if p_mode='2V2' then
    -- Resultado exclusivamente por equipo. No intervienen las bajas individuales.
    rating_red := (old_r[1]+old_r[3])::double precision/2;
    rating_blue := (old_r[2]+old_r[4])::double precision/2;
    expected := 1.0/(1.0+power(10.0,(rating_blue-rating_red)/400.0));
    delta := case when p_winning_team is null then 0
      else round(32.0*((case when p_winning_team='RED' then 1.0 else 0.0 end)-expected)) end;
    new_r[1] := greatest(100,old_r[1]+delta);
    new_r[3] := greatest(100,old_r[3]+delta);
    new_r[2] := greatest(100,old_r[2]-delta);
    new_r[4] := greatest(100,old_r[4]-delta);
  else
    -- FFA: ELO basado en posición. Cada jugador compite matemáticamente contra
    -- los otros tres; empates de puesto valen 0,5. Normalizar conserva K=32.
    for i in 1..4 loop
      sum_score := 0;
      for j in 1..4 loop
        if i<>j then
          actual := case when p_places[i]<p_places[j] then 1.0
                         when p_places[i]=p_places[j] then 0.5 else 0.0 end;
          expected := 1.0/(1.0+power(10.0,(old_r[j]-old_r[i])::double precision/400.0));
          sum_score := sum_score+(actual-expected);
        end if;
      end loop;
      new_r[i] := greatest(100,old_r[i]+round(32.0*sum_score/3.0));
    end loop;
  end if;

  -- El registro y los cuatro cambios de rating son una sola transacción.
  insert into public.group_ranked_matches(match_id,mode,stage_id,player_ids,places,
    rating_before,rating_after,winning_team)
  values(p_match_id,p_mode,p_stage,p_player_ids,p_places,old_r,new_r,p_winning_team);
  select count(*) into any_first_count from unnest(p_places) as p(place) where p.place=1;
  for i in 1..4 loop
    update public.player_profiles set
      rating=new_r[i],
      wins=wins+(case
        when p_mode='2V2' and p_winning_team is not null and
             ((i in (1,3) and p_winning_team='RED') or (i in (2,4) and p_winning_team='BLUE')) then 1
        when p_mode='FREE_FOR_ALL' and p_places[i]=1 and any_first_count=1 then 1 else 0 end),
      losses=losses+(case
        when p_mode='2V2' and p_winning_team is not null and
             ((i in (1,3) and p_winning_team='BLUE') or (i in (2,4) and p_winning_team='RED')) then 1
        when p_mode='FREE_FOR_ALL' and p_places[i]>1 then 1 else 0 end),
      updated_at=now()
    where id=p_player_ids[i];
    scores:=scores||jsonb_build_array(jsonb_build_object(
      'seat',i-1,'place',p_places[i],
      'old_rating',old_r[i],'new_rating',new_r[i],'delta',new_r[i]-old_r[i]));
  end loop;
  return jsonb_build_object('recorded',true,'mode',p_mode,'players',scores);
end;
$$;
revoke all on function public.record_group_ranked_match(uuid,text,uuid[],integer[],text,text) from public,anon,authenticated;
grant execute on function public.record_group_ranked_match(uuid,text,uuid[],integer[],text,text) to service_role;
