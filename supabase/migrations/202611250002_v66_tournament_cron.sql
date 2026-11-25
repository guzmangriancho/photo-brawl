-- V66: once-a-minute safety ping so rounds resolve even if the game server was asleep.
-- Best effort and idempotent: if pg_cron / pg_net are unavailable the in-server timer and
-- client polling still drive the tournament (see docs/V66_TORNEOS.md).
do $$
begin
  begin
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron/pg_net not available: %', sqlerrm;
    return;
  end;
  begin
    perform cron.unschedule('pb-tournament-tick');
  exception when others then null;
  end;
  perform cron.schedule('pb-tournament-tick', '* * * * *',
    $cmd$select net.http_post(url := 'https://photo-brawl-online.onrender.com/tournament/tick', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 55000)$cmd$);
exception when others then
  raise notice 'tournament cron not scheduled: %', sqlerrm;
end $$;
