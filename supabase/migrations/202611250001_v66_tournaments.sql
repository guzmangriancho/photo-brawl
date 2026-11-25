-- V66 Torneos por rondas. Solo AÑADE tablas, funciones y un bucket. No toca nada existente.
-- Todo acceso pasa por el servidor online (clave secreta). Los clientes no leen ni escriben estas tablas.

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  status text not null default 'registration' check (status in ('registration','round_open','simulating','finished','cancelled')),
  sim_version int not null default 1,
  engine_version text not null default 'e1',
  stage text not null default 'SKI_RESORT',
  difficulty text not null default 'NORMAL' check (difficulty in ('EASY','NORMAL','HARD')),
  window_minutes int check (window_minutes is null or window_minutes between 1 and 2880),      -- null = calendario real
  registration_minutes int check (registration_minutes is null or registration_minutes between 1 and 4320),
  auto_next boolean not null default true,
  registration_opens_at timestamptz not null default now(),
  registration_closes_at timestamptz not null,
  extended boolean not null default false,
  bracket_seed text not null default md5(random()::text||clock_timestamp()::text),
  prelim_count int not null default 0,
  round_no int not null default 0,
  round_count int,
  revealed_round int not null default 0,
  round_cutoff timestamptz,
  schedule jsonb,
  entrant_count int not null default 0,
  sim_lock_until timestamptz,
  champion_entry_id uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
-- Solo un torneo vivo a la vez.
create unique index if not exists tournaments_one_live on public.tournaments((true)) where status in ('registration','round_open','simulating');

create table if not exists public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  account_id uuid not null references public.player_profiles(id) on delete cascade,
  fighter_local_id text not null,
  fighter_data jsonb not null check (jsonb_typeof(fighter_data)='object' and pg_column_size(fighter_data) < 32000),
  portrait_path text not null,
  sheet_path text not null,
  display_name text not null,
  instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  video_consent boolean not null default false,
  status text not null default 'active' check (status in ('active','eliminated','champion')),
  eliminated_round int,
  slot int,
  created_at timestamptz not null default now(),
  unique(tournament_id,account_id)
);
create index if not exists tournament_entries_slot_idx on public.tournament_entries(tournament_id,slot);

create table if not exists public.tournament_entry_tactics (
  entry_id uuid primary key references public.tournament_entries(id) on delete cascade,
  tactics jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_no int not null,
  slot int not null,
  entry_a uuid not null references public.tournament_entries(id),
  entry_b uuid not null references public.tournament_entries(id),
  tactics_a jsonb,
  tactics_b jsonb,
  status text not null default 'pending' check (status in ('pending','resolved')),
  winner_entry uuid references public.tournament_entries(id),
  score_a int,
  score_b int,
  frames int,
  decided_by text check (decided_by is null or decided_by in ('ko','cap')),
  seed bigint,
  sim_version int,
  engine_version text,
  resolved_at timestamptz,
  unique(tournament_id,round_no,slot),
  check (entry_a<>entry_b)
);
create index if not exists tournament_matches_pending_idx on public.tournament_matches(tournament_id,round_no) where status='pending';
create index if not exists tournament_matches_a_idx on public.tournament_matches(entry_a);
create index if not exists tournament_matches_b_idx on public.tournament_matches(entry_b);

alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.tournament_entry_tactics enable row level security;
alter table public.tournament_matches enable row level security;
revoke all on public.tournaments,public.tournament_entries,public.tournament_entry_tactics,public.tournament_matches from anon,authenticated;

-- Imágenes congeladas de los luchadores inscritos (el rival tiene que verlas). Ruta con UUID aleatorio.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('tournament-fighters','tournament-fighters',true,5242880,array['image/png','image/webp','image/jpeg'])
on conflict (id) do nothing;

-- Calendario de cortes: ventana = 20 h repartidas entre las rondas, entre 1 h y 4 h; los cortes que caen entre las 23:00 y las 09:00 (Madrid)
-- pasan a las 12:00. Con muchas rondas el mínimo de 1 h alarga el torneo en lugar de recortar ventanas.
create or replace function public.pb_tournament_schedule(p_from timestamptz,p_rounds int,p_window_minutes int)
returns jsonb language plpgsql as $$
declare cur timestamptz:=p_from; w interval; out jsonb:='[]'::jsonb; i int; loc timestamp; h int;
begin
  if p_window_minutes is not null then w:=make_interval(mins=>p_window_minutes);
  else w:=make_interval(secs=>(least(4.0,greatest(1.0,20.0/greatest(p_rounds,1)))*3600)::int); end if;
  for i in 1..p_rounds loop
    cur:=cur+w;
    if p_window_minutes is null then
      loc:=cur at time zone 'Europe/Madrid'; h:=extract(hour from loc)::int;
      if h>=23 then cur:=((date_trunc('day',loc)+interval '1 day 12 hours') at time zone 'Europe/Madrid');
      elsif h<9 then cur:=((date_trunc('day',loc)+interval '12 hours') at time zone 'Europe/Madrid'); end if;
    end if;
    out:=out||to_jsonb(cur);
  end loop;
  return out;
end $$;

create or replace function public.pb_tournament_next_close(p_minutes int)
returns timestamptz language plpgsql as $$
declare t timestamptz; loc timestamp;
begin
  if p_minutes is not null then return now()+make_interval(mins=>p_minutes); end if;
  -- Próximas 12:00 de Madrid con al menos 8 h de inscripción.
  loc:=(now()+interval '8 hours') at time zone 'Europe/Madrid';
  t:=(date_trunc('day',loc)+interval '12 hours') at time zone 'Europe/Madrid';
  if t<now()+interval '8 hours' then t:=((date_trunc('day',loc)+interval '1 day 12 hours') at time zone 'Europe/Madrid'); end if;
  return t;
end $$;

create or replace function public.pb_tournament_create_next(p_prev uuid)
returns uuid language plpgsql as $$
declare p public.tournaments; nid uuid;
begin
  select * into p from public.tournaments where id=p_prev;
  insert into public.tournaments(stage,difficulty,window_minutes,registration_minutes,auto_next,registration_closes_at,engine_version,sim_version)
  values (p.stage,p.difficulty,p.window_minutes,p.registration_minutes,p.auto_next,public.pb_tournament_next_close(p.registration_minutes),p.engine_version,p.sim_version)
  returning id into nid;
  return nid;
end $$;

-- Qué toca hacer ahora (la hora la decide el reloj de la base de datos).
create or replace function public.pb_tournament_next_action()
returns table(id uuid,action text) language sql stable as $$
  select t.id, case
    when t.status='registration' and t.registration_closes_at<=now() then 'close'
    when t.status='round_open' and t.round_cutoff<=now() then 'cut'
    when t.status='simulating' and (t.sim_lock_until is null or t.sim_lock_until<now()) then 'simulate'
  end from public.tournaments t where t.status in ('registration','round_open','simulating')
$$;

-- Cierra la inscripción: sortea, crea la primera ronda y fija el calendario. Atómico y repetible.
create or replace function public.pb_tournament_close_registration(p_id uuid)
returns text language plpgsql as $$
declare t public.tournaments; n int; m int; prelim int; rounds int; sched jsonb; nid uuid;
begin
  select * into t from public.tournaments where id=p_id for update;
  if not found or t.status<>'registration' or t.registration_closes_at>now() then return 'noop'; end if;
  select count(*) into n from public.tournament_entries where tournament_id=p_id;
  if n<2 then
    if not t.extended then
      update public.tournaments set extended=true,registration_closes_at=now()+case when window_minutes is null then interval '24 hours' else make_interval(mins=>coalesce(registration_minutes,window_minutes)) end where id=p_id;
      return 'extended';
    end if;
    update public.tournaments set status='cancelled',finished_at=now(),entrant_count=n where id=p_id;
    if t.auto_next then
      nid:=public.pb_tournament_create_next(p_id);
      update public.tournament_entries set tournament_id=nid where tournament_id=p_id; -- los pocos inscritos pasan al siguiente
    end if;
    return 'cancelled';
  end if;
  m:=(2^floor(log(2,n::numeric)))::int; prelim:=n-m;
  rounds:=floor(log(2,m::numeric))::int+case when prelim>0 then 1 else 0 end;
  with ranked as (select id,row_number() over (order by md5(t.bracket_seed||id::text)) rn from public.tournament_entries where tournament_id=p_id)
  update public.tournament_entries e set slot=r.rn-1 from ranked r where e.id=r.id;
  if prelim>0 then
    insert into public.tournament_matches(tournament_id,round_no,slot,entry_a,entry_b)
    select p_id,1,a.slot/2,a.id,b.id from public.tournament_entries a join public.tournament_entries b on b.tournament_id=a.tournament_id and b.slot=a.slot+1
    where a.tournament_id=p_id and a.slot%2=0 and a.slot<2*prelim;
  else
    insert into public.tournament_matches(tournament_id,round_no,slot,entry_a,entry_b)
    select p_id,1,a.slot/2,a.id,b.id from public.tournament_entries a join public.tournament_entries b on b.tournament_id=a.tournament_id and b.slot=a.slot+1
    where a.tournament_id=p_id and a.slot%2=0;
  end if;
  sched:=public.pb_tournament_schedule(now(),rounds,t.window_minutes);
  update public.tournaments set status='round_open',entrant_count=n,prelim_count=prelim,round_count=rounds,round_no=1,schedule=sched,
    round_cutoff=(sched->>0)::timestamptz where id=p_id;
  return 'opened';
end $$;

-- Corte de ronda: congela las tácticas de cada pareja y pasa a simulando. Lo que se edite después cuenta para la siguiente.
create or replace function public.pb_tournament_cut_round(p_id uuid)
returns boolean language plpgsql as $$
declare t public.tournaments;
begin
  select * into t from public.tournaments where id=p_id for update;
  if not found or t.status<>'round_open' or t.round_cutoff>now() then return false; end if;
  update public.tournament_matches m set
    tactics_a=coalesce((select x.tactics from public.tournament_entry_tactics x where x.entry_id=m.entry_a),'{}'::jsonb),
    tactics_b=coalesce((select x.tactics from public.tournament_entry_tactics x where x.entry_id=m.entry_b),'{}'::jsonb)
  where m.tournament_id=p_id and m.round_no=t.round_no and m.status='pending';
  update public.tournaments set status='simulating',sim_lock_until=null where id=p_id;
  return true;
end $$;

-- Un único proceso simula a la vez (arrendamiento con caducidad).
create or replace function public.pb_tournament_claim(p_id uuid,p_seconds int)
returns boolean language plpgsql as $$
declare ok boolean;
begin
  update public.tournaments set sim_lock_until=now()+make_interval(secs=>p_seconds)
  where id=p_id and status='simulating' and (sim_lock_until is null or sim_lock_until<now() or p_seconds<=0)
  returning true into ok;
  return coalesce(ok,false);
end $$;

-- Cuando no quedan combates pendientes: elimina, destapa, y abre la ronda siguiente o termina. Una sola vez.
create or replace function public.pb_tournament_finish_round(p_id uuid)
returns text language plpgsql as $$
declare t public.tournaments; pend int; total int; r int; nxt timestamptz; minw interval; nid uuid; champ uuid;
begin
  select * into t from public.tournaments where id=p_id for update;
  if not found or t.status<>'simulating' then return 'noop'; end if;
  r:=t.round_no;
  select count(*) filter (where status='pending'),count(*) into pend,total from public.tournament_matches where tournament_id=p_id and round_no=r;
  if pend>0 then return 'pending'; end if;
  update public.tournament_entries e set status='eliminated',eliminated_round=r
  from public.tournament_matches m where m.tournament_id=p_id and m.round_no=r and (e.id=m.entry_a or e.id=m.entry_b) and e.id<>m.winner_entry;
  if r>=t.round_count then
    select winner_entry into champ from public.tournament_matches where tournament_id=p_id and round_no=r limit 1;
    update public.tournament_entries set status='champion' where id=champ;
    update public.tournaments set status='finished',finished_at=now(),revealed_round=r,champion_entry_id=champ,sim_lock_until=null where id=p_id;
    if t.auto_next then nid:=public.pb_tournament_create_next(p_id); end if;
    return 'finished';
  end if;
  -- Posiciones de la ronda siguiente: tras la previa, los ganadores ocupan las primeras plazas y los exentos el resto.
  with pos as (
    select m.slot as p,m.winner_entry as e from public.tournament_matches m where m.tournament_id=p_id and m.round_no=r and not (r=1 and t.prelim_count>0)
    union all
    select m.slot,m.winner_entry from public.tournament_matches m where m.tournament_id=p_id and m.round_no=1 and r=1 and t.prelim_count>0
    union all
    select t.prelim_count+(e.slot-2*t.prelim_count),e.id from public.tournament_entries e where e.tournament_id=p_id and r=1 and t.prelim_count>0 and e.slot>=2*t.prelim_count
  )
  insert into public.tournament_matches(tournament_id,round_no,slot,entry_a,entry_b)
  select p_id,r+1,a.p/2,a.e,b.e from pos a join pos b on b.p=a.p+1 where a.p%2=0;
  minw:=case when t.window_minutes is null then interval '1 hour' else make_interval(mins=>t.window_minutes) end;
  nxt:=greatest((t.schedule->>r)::timestamptz,now()+minw);
  update public.tournaments set status='round_open',round_no=r+1,revealed_round=r,round_cutoff=nxt,sim_lock_until=null where id=p_id;
  return 'next';
end $$;

-- Guardar tácticas: solo del dueño, máximo una edición por segundo.
create or replace function public.pb_tournament_save_tactics(p_entry uuid,p_account uuid,p_tactics jsonb)
returns boolean language plpgsql as $$
declare last timestamptz;
begin
  if not exists(select 1 from public.tournament_entries e join public.tournaments t on t.id=e.tournament_id
    where e.id=p_entry and e.account_id=p_account and e.status='active' and t.status in ('registration','round_open','simulating')) then return false; end if;
  select updated_at into last from public.tournament_entry_tactics where entry_id=p_entry;
  if last is not null and last>now()-interval '1 second' then raise exception 'demasiado rápido'; end if;
  insert into public.tournament_entry_tactics(entry_id,tactics,updated_at) values (p_entry,p_tactics,now())
  on conflict (entry_id) do update set tactics=excluded.tactics,updated_at=now();
  return true;
end $$;

-- Inscribirse (o cambiar de luchador) solo con la inscripción abierta; una inscripción por cuenta.
create or replace function public.pb_tournament_join(p_tournament uuid,p_account uuid,p_local text,p_data jsonb,p_portrait text,p_sheet text,
  p_name text,p_instagram text,p_consent boolean,p_tactics jsonb)
returns uuid language plpgsql as $$
declare t public.tournaments; eid uuid;
begin
  select * into t from public.tournaments where id=p_tournament for share;
  if not found or t.status<>'registration' or t.registration_closes_at<=now() then raise exception 'inscripción cerrada'; end if;
  insert into public.tournament_entries(tournament_id,account_id,fighter_local_id,fighter_data,portrait_path,sheet_path,display_name,instagram,video_consent)
  values (p_tournament,p_account,p_local,p_data,p_portrait,p_sheet,p_name,nullif(p_instagram,''),coalesce(p_consent,false))
  on conflict (tournament_id,account_id) do update set fighter_local_id=excluded.fighter_local_id,fighter_data=excluded.fighter_data,
    portrait_path=excluded.portrait_path,sheet_path=excluded.sheet_path,display_name=excluded.display_name,instagram=excluded.instagram,video_consent=excluded.video_consent
  returning id into eid;
  insert into public.tournament_entry_tactics(entry_id,tactics,updated_at) values (eid,p_tactics,now()-interval '1 minute') on conflict (entry_id) do nothing;
  return eid;
end $$;

revoke all on function public.pb_tournament_schedule(timestamptz,int,int),public.pb_tournament_next_close(int),public.pb_tournament_create_next(uuid),
  public.pb_tournament_next_action(),public.pb_tournament_close_registration(uuid),public.pb_tournament_cut_round(uuid),public.pb_tournament_claim(uuid,int),
  public.pb_tournament_finish_round(uuid),public.pb_tournament_save_tactics(uuid,uuid,jsonb),
  public.pb_tournament_join(uuid,uuid,text,jsonb,text,text,text,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.pb_tournament_schedule(timestamptz,int,int),public.pb_tournament_next_close(int),public.pb_tournament_create_next(uuid),
  public.pb_tournament_next_action(),public.pb_tournament_close_registration(uuid),public.pb_tournament_cut_round(uuid),public.pb_tournament_claim(uuid,int),
  public.pb_tournament_finish_round(uuid),public.pb_tournament_save_tactics(uuid,uuid,jsonb),
  public.pb_tournament_join(uuid,uuid,text,jsonb,text,text,text,text,boolean,jsonb) to service_role;

-- Guarda en bloque los resultados simulados de un lote (solo combates aún pendientes: repetir un lote no duplica nada).
create or replace function public.pb_tournament_store_results(p_tid uuid,p_rows jsonb)
returns int language plpgsql as $$
declare n int;
begin
  with u as (
    update public.tournament_matches m set status='resolved',
      winner_entry=case when r.w='a' then m.entry_a else m.entry_b end,
      score_a=r.sa,score_b=r.sb,frames=r.f,decided_by=r.d,seed=r.seed,sim_version=r.sv,engine_version=r.ev,resolved_at=now()
    from jsonb_to_recordset(p_rows) as r(id uuid,w text,sa int,sb int,f int,d text,seed bigint,sv int,ev text)
    where m.id=r.id and m.tournament_id=p_tid and m.status='pending' and m.tactics_a is not null
    returning 1)
  select count(*) into n from u;
  return n;
end $$;
revoke all on function public.pb_tournament_store_results(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pb_tournament_store_results(uuid,jsonb) to service_role;
