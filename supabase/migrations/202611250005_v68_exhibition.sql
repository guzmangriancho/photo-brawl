-- V68 (preparación local, NO aplicada). Exhibición interna: torneo automático con copias congeladas de luchadores públicos.
-- No inscribe cuentas (account_id nulo), no escribe en ranking ni en historial personal. Solo AÑADE columnas/funciones y relaja un NOT NULL.
alter table public.tournaments add column if not exists kind text not null default 'real' check (kind in ('real','exhibition'));
alter table public.tournaments add column if not exists label text check (label is null or char_length(label)<=80);
alter table public.tournament_entries alter column account_id drop not null;
alter table public.tournament_entries add column if not exists exhibition boolean not null default false;
alter table public.tournament_entries drop constraint if exists tournament_entries_account_or_exhibition;
alter table public.tournament_entries add constraint tournament_entries_account_or_exhibition check (exhibition or account_id is not null);

-- El siguiente torneo es siempre real, con calendario normal (la exhibición no hereda su ventana corta).
create or replace function public.pb_tournament_create_next(p_prev uuid)
returns uuid language plpgsql as $$
declare p public.tournaments; nid uuid; ex boolean;
  arenas text[]:=array['SUNKEN_ATLANTIS','SPIRIT_FOREST','CELESTIAL_TEMPLE','VOLCANIC_FORTRESS'];
begin
  select * into p from public.tournaments where id=p_prev;
  ex:=p.kind='exhibition';
  insert into public.tournaments(stage,difficulty,window_minutes,registration_minutes,auto_next,registration_closes_at,engine_version,sim_version,kind)
  values (arenas[1+floor(random()*4)::int],p.difficulty,case when ex then null else p.window_minutes end,case when ex then null else p.registration_minutes end,
    true,public.pb_tournament_next_close(case when ex then null else p.registration_minutes end),'e2',2,'real')
  returning id into nid;
  return nid;
end $$;

-- Crea la exhibición (falla si hay otro torneo vivo: índice único). Cierra sola a los 3 min; entre tanto se cargan las copias.
create or replace function public.pb_tournament_create_exhibition(p_label text,p_window_minutes int,p_stage text)
returns uuid language plpgsql as $$
declare nid uuid;
begin
  insert into public.tournaments(kind,label,stage,window_minutes,registration_minutes,auto_next,registration_closes_at,engine_version,sim_version)
  values ('exhibition',left(p_label,80),p_stage,p_window_minutes,3,true,now()+interval '3 minutes','e2',2) returning id into nid;
  return nid;
end $$;

create or replace function public.pb_tournament_add_exhibition_entry(p_tournament uuid,p_local text,p_data jsonb,p_portrait text,p_sheet text,p_name text,p_tactics jsonb)
returns uuid language plpgsql as $$
declare eid uuid;
begin
  if not exists(select 1 from public.tournaments where id=p_tournament and kind='exhibition' and status='registration') then raise exception 'no es una exhibición abierta'; end if;
  insert into public.tournament_entries(tournament_id,account_id,fighter_local_id,fighter_data,portrait_path,sheet_path,display_name,instagram,video_consent,exhibition)
  values (p_tournament,null,p_local,p_data,p_portrait,p_sheet,p_name,null,false,true) returning id into eid;
  insert into public.tournament_entry_tactics(entry_id,tactics,updated_at) values (eid,p_tactics,now());
  return eid;
end $$;

create or replace function public.pb_tournament_is_admin(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from photo_brawl_internal.admin_users where user_id=p_user)
$$;
revoke all on function public.pb_tournament_create_next(uuid),public.pb_tournament_create_exhibition(text,int,text),
  public.pb_tournament_add_exhibition_entry(uuid,text,jsonb,text,text,text,jsonb),public.pb_tournament_is_admin(uuid) from public,anon,authenticated;
grant execute on function public.pb_tournament_create_next(uuid),public.pb_tournament_create_exhibition(text,int,text),
  public.pb_tournament_add_exhibition_entry(uuid,text,jsonb,text,text,text,jsonb),public.pb_tournament_is_admin(uuid) to service_role;
