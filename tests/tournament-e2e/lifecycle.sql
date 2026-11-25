-- ciclo completo con N inscritos; el ganador de cada combate es entry_a salvo lo contrario
create or replace function pg_temp.run(n int) returns text language plpgsql as $$
declare tid uuid; i int; a uuid; act record; res text; steps int:=0; log text:=''; matches int;
begin
  delete from tournaments;delete from player_profiles;
  insert into tournaments(registration_closes_at,window_minutes,registration_minutes,auto_next) values (now()+interval '1 minute',1,1,false) returning id into tid;
  for i in 1..n loop
    insert into player_profiles default values returning id into a;
    perform pb_tournament_join(tid,a,'f'||i,'{}'::jsonb,'p','s','F'||i,null,false,'{"distance":50}'::jsonb);
  end loop;
  update tournaments set registration_closes_at=now()-interval '1 second' where id=tid;
  loop
    steps:=steps+1; exit when steps>200;
    select * into act from pb_tournament_next_action() limit 1;
    exit when act.action is null and (select status from tournaments where id=tid) in ('finished','cancelled');
    if act.action='close' then res:=pb_tournament_close_registration(tid);
    elsif act.action='cut' then perform pb_tournament_cut_round(tid);
    elsif act.action='simulate' then
      if pb_tournament_claim(tid,60) then
        update tournament_matches set status='resolved',winner_entry=case when slot%2=0 then entry_a else entry_b end,score_a=2,score_b=0,frames=1,decided_by='ko',seed=1,sim_version=1,engine_version='e1' where tournament_id=tid and status='pending' and tactics_a is not null;
        res:=pb_tournament_finish_round(tid);
        perform pb_tournament_claim(tid,0);
      end if;
    else update tournaments set round_cutoff=now()-interval '1 second' where id=tid and status='round_open'; end if;
  end loop;
  select count(*) into matches from tournament_matches where tournament_id=tid;
  return format('n=%s status=%s rounds=%s matches=%s champion=%s eliminated=%s revealed=%s',n,(select status from tournaments where id=tid),(select round_count from tournaments where id=tid),matches,
    (select count(*) from tournament_entries where tournament_id=tid and status='champion'),(select count(*) from tournament_entries where tournament_id=tid and status='eliminated'),(select revealed_round from tournaments where id=tid));
end $$;
select pg_temp.run(2); select pg_temp.run(3); select pg_temp.run(5); select pg_temp.run(8); select pg_temp.run(100); select pg_temp.run(1000);
