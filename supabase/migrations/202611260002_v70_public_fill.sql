-- V70: permite añadir copias de luchadores públicos (sin cuenta, tácticas por defecto) a un torneo normal en inscripción.
-- Solo reemplaza la función; sigue siendo service_role. No toca datos existentes.
create or replace function public.pb_tournament_add_exhibition_entry(p_tournament uuid,p_local text,p_data jsonb,p_portrait text,p_sheet text,p_name text,p_tactics jsonb)
returns uuid language plpgsql as $$
declare eid uuid;
begin
  if not exists(select 1 from public.tournaments where id=p_tournament and status='registration') then raise exception 'no es un torneo en inscripción'; end if;
  if exists(select 1 from public.tournament_entries where tournament_id=p_tournament and fighter_local_id=p_local) then raise exception 'ya inscrito'; end if;
  insert into public.tournament_entries(tournament_id,account_id,fighter_local_id,fighter_data,portrait_path,sheet_path,display_name,instagram,video_consent,exhibition)
  values (p_tournament,null,p_local,p_data,p_portrait,p_sheet,p_name,null,false,true) returning id into eid;
  insert into public.tournament_entry_tactics(entry_id,tactics,updated_at) values (eid,p_tactics,now());
  return eid;
end $$;
revoke all on function public.pb_tournament_add_exhibition_entry(uuid,text,jsonb,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.pb_tournament_add_exhibition_entry(uuid,text,jsonb,text,text,text,jsonb) to service_role;
