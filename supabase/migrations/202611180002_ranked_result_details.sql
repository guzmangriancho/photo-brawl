-- PHOTO BRAWL V22 · Devuelve los ratings anteriores y posteriores para el resumen final.
-- Mantiene la política V21: cada match_id se registra una sola vez y las revanchas cuentan.
-- No modifica resultados ni ratings existentes; solo amplía la respuesta de la RPC.
create or replace function public.record_ranked_match(
  p_match_id uuid,p_host_id uuid,p_guest_id uuid,p_host_rounds integer,p_guest_rounds integer,p_stage text,p_result_type text default 'played'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  host_record public.player_profiles%rowtype;
  guest_record public.player_profiles%rowtype;
  old_host integer;
  old_guest integer;
  expected_host double precision;
  delta integer;
  new_host integer;
  new_guest integer;
  winner uuid;
begin
  if p_result_type not in ('played','forfeit') or p_host_id = p_guest_id or p_host_id is null or p_guest_id is null or
     not ((p_host_rounds = 2 and p_guest_rounds between 0 and 1) or
          (p_guest_rounds = 2 and p_host_rounds between 0 and 1)) then
    raise exception 'Marcador o jugadores no válidos';
  end if;

  -- Orden estable para evitar deadlocks en partidas simultáneas de las mismas cuentas.
  perform 1 from public.player_profiles where id in (p_host_id,p_guest_id) order by id for update;
  select * into host_record from public.player_profiles where id=p_host_id;
  select * into guest_record from public.player_profiles where id=p_guest_id;
  if host_record.id is null or guest_record.id is null then raise exception 'Cuentas no encontradas'; end if;

  -- Un mismo resultado no puede aplicarse dos veces; una revancha usa otro UUID.
  if exists(select 1 from public.ranked_matches where match_id=p_match_id) then
    return jsonb_build_object('recorded',false,'reason','duplicate');
  end if;

  old_host:=host_record.rating;
  old_guest:=guest_record.rating;
  expected_host:=1.0 / (1.0 + power(10.0,(old_guest-old_host)::double precision/400.0));
  delta:=round(32.0*((case when p_host_rounds=2 then 1 else 0 end)-expected_host));
  new_host:=greatest(100,old_host+delta);
  new_guest:=greatest(100,old_guest-delta);
  winner:=case when p_host_rounds=2 then p_host_id else p_guest_id end;

  insert into public.ranked_matches(match_id,host_id,guest_id,winner_id,host_rounds,guest_rounds,stage_id,result_type,
      host_rating_before,guest_rating_before,host_rating_after,guest_rating_after)
  values (p_match_id,p_host_id,p_guest_id,winner,p_host_rounds,p_guest_rounds,p_stage,p_result_type,
      old_host,old_guest,new_host,new_guest);

  update public.player_profiles set rating=new_host,wins=wins+(case when winner=p_host_id then 1 else 0 end),
      losses=losses+(case when winner=p_guest_id then 1 else 0 end),updated_at=now() where id=p_host_id;
  update public.player_profiles set rating=new_guest,wins=wins+(case when winner=p_guest_id then 1 else 0 end),
      losses=losses+(case when winner=p_host_id then 1 else 0 end),updated_at=now() where id=p_guest_id;

  return jsonb_build_object(
    'recorded',true,
    'winner_id',winner,
    'host_rating_before',old_host,
    'guest_rating_before',old_guest,
    'host_rating',new_host,
    'guest_rating',new_guest
  );
end;
$$;

revoke all on function public.record_ranked_match(uuid,uuid,uuid,integer,integer,text,text) from public,anon,authenticated;
grant execute on function public.record_ranked_match(uuid,uuid,uuid,integer,integer,text,text) to service_role;
