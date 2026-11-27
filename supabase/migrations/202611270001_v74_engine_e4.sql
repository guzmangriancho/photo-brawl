-- V74: motor de torneo e4 (tornado vertical multigolpe). Los torneos ya creados (e1/e2/e3) NO se tocan:
-- cada uno conserva su engine_version y sus combates ya generados. Solo los torneos que se creen despues usan e4.
-- No hay ningun UPDATE sobre public.tournaments ni sobre tournament_matches.
alter table public.tournaments alter column engine_version set default 'e4';
alter table public.tournaments alter column sim_version set default 4;
do $$ declare d text; begin
  for d in select pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('pb_tournament_create_next','pb_tournament_create_exhibition') loop
    execute replace(d, '''e3'',3', '''e4'',4');
  end loop;
end $$;
