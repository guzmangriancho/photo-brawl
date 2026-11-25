-- V67 (preparación local, NO aplicada). Torneos solo en arenas grandes y rondas al mejor de 1 hasta cuartos.
-- Solo AÑADE una columna y sustituye dos funciones. No borra ni reescribe datos de torneos existentes (siguen en e1).
alter table public.tournament_matches add column if not exists rounds_to_win smallint;  -- null = combate de e1, al mejor de 3

alter table public.tournaments alter column stage set default 'SPIRIT_FOREST';
alter table public.tournaments alter column engine_version set default 'e2';
alter table public.tournaments alter column sim_version set default 2;

create or replace function public.pb_tournament_create_next(p_prev uuid)
returns uuid language plpgsql as $$
declare p public.tournaments; nid uuid;
  arenas text[]:=array['SUNKEN_ATLANTIS','SPIRIT_FOREST','CELESTIAL_TEMPLE','VOLCANIC_FORTRESS'];
begin
  select * into p from public.tournaments where id=p_prev;
  insert into public.tournaments(stage,difficulty,window_minutes,registration_minutes,auto_next,registration_closes_at,engine_version,sim_version)
  values (arenas[1+floor(random()*4)::int],p.difficulty,p.window_minutes,p.registration_minutes,p.auto_next,public.pb_tournament_next_close(p.registration_minutes),'e2',2)
  returning id into nid;
  return nid;
end $$;

create or replace function public.pb_tournament_store_results(p_tid uuid,p_rows jsonb)
returns int language plpgsql as $$
declare n int;
begin
  with u as (
    update public.tournament_matches m set status='resolved',
      winner_entry=case when r.w='a' then m.entry_a else m.entry_b end,
      score_a=r.sa,score_b=r.sb,frames=r.f,decided_by=r.d,seed=r.seed,sim_version=r.sv,engine_version=r.ev,
      rounds_to_win=case when r.ev='e1' then null else r.rtw end,resolved_at=now()
    from jsonb_to_recordset(p_rows) as r(id uuid,w text,sa int,sb int,f int,d text,seed bigint,sv int,ev text,rtw int)
    where m.id=r.id and m.tournament_id=p_tid and m.status='pending' and m.tactics_a is not null
    returning 1)
  select count(*) into n from u;
  return n;
end $$;
revoke all on function public.pb_tournament_store_results(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pb_tournament_store_results(uuid,jsonb) to service_role;
