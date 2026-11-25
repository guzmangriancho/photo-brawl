-- V69: motor de torneo e3 (equilibrio de combate). Aplicada a mano el 26 nov 2026.
-- Los torneos ya resueltos (e1/e2) no se tocan. El torneo abierto sin combates generados pasa a e3.
alter table public.tournaments alter column engine_version set default 'e3';
alter table public.tournaments alter column sim_version set default 3;
update public.tournaments set engine_version='e3', sim_version=3
  where id='cd173c4e-c781-4d2e-b457-a24b5ebfb2cc' and status='registration' and engine_version='e2'
  and not exists (select 1 from public.tournament_matches m where m.tournament_id=tournaments.id);
-- Las funciones que crean torneos fijaban 'e2',2: se reescriben con 'e3',3.
do $$ declare d text; begin
  for d in select pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('pb_tournament_create_next','pb_tournament_create_exhibition') loop
    execute replace(d, '''e2'',2', '''e3'',3');
  end loop;
end $$;
