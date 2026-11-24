-- PHOTO BRAWL V62: monedas, slots de luchadores y apuestas virtuales (sin dinero real).
-- Reejecutable. Aplicar ANTES de desplegar el cliente y el servidor V62: si falta, el juego
-- funciona igual que antes (sin limite ni monedas) hasta que se ejecute.
-- Reglas:
--   * Cada cuenta empieza con 300 monedas y 4 slots (o mas, si ya tenia mas luchadores: nadie pierde ninguno).
--   * Slots adicionales: 5=200, 6=350, 7=500, 8=750, 9=1000, 10=1250, 11=1500, 12=2000 monedas (maximo 12).
--   * Solo el servidor (service_role) concede monedas, bloquea y liquida apuestas. El cliente solo lee su monedero y compra slots.
--   * Monedas: 1 vs 1 clasificatoria 25 (victoria) / 10 (derrota); grupos 30/20/12/8 por puesto; maximo 10 partidas con premio al dia.
--   * Apuestas: solo clasificatorias 1 vs 1, de 10 a 100 monedas, ambos bloquean la apuesta al empezar; gana el doble el vencedor.
--     Abandonar una partida apostada cuenta como derrota. Apuestas bloqueadas sin liquidar se devuelven.

create table if not exists public.player_wallets (
 account_id uuid primary key references public.player_profiles(id) on delete cascade,
 coins integer not null default 0 check (coins >= 0),
 character_slots smallint not null default 4 check (character_slots between 1 and 64),
 lifetime_earned bigint not null default 0 check (lifetime_earned >= 0),
 lifetime_spent bigint not null default 0 check (lifetime_spent >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.coin_ledger (
 id bigint generated always as identity primary key,
 account_id uuid not null references public.player_profiles(id) on delete cascade,
 delta integer not null check (delta <> 0),
 balance_after integer not null check (balance_after >= 0),
 kind text not null check (kind in ('welcome','match_reward','wager_stake','wager_win','wager_refund','slot_purchase')),
 ref text not null,
 created_at timestamptz not null default now(),
 unique (account_id, kind, ref)
);
create index if not exists coin_ledger_account_idx on public.coin_ledger(account_id, created_at desc);

create table if not exists public.wager_escrows (
 match_id uuid primary key,
 host_id uuid not null references public.player_profiles(id) on delete cascade,
 guest_id uuid not null references public.player_profiles(id) on delete cascade,
 stake integer not null check (stake between 1 and 100),
 status text not null default 'locked' check (status in ('locked','settled','refunded')),
 winner_id uuid references public.player_profiles(id) on delete set null,
 settle_reason text,
 created_at timestamptz not null default now(),
 settled_at timestamptz,
 check (host_id <> guest_id)
);
create index if not exists wager_escrows_open_idx on public.wager_escrows(created_at) where status = 'locked';

alter table public.player_wallets enable row level security;
alter table public.coin_ledger enable row level security;
alter table public.wager_escrows enable row level security;
revoke all on public.player_wallets, public.coin_ledger, public.wager_escrows from public, anon, authenticated;
grant select on public.player_wallets, public.coin_ledger to authenticated;
drop policy if exists "Ver mi monedero" on public.player_wallets;
create policy "Ver mi monedero" on public.player_wallets for select to authenticated using (account_id = (select auth.uid()));
drop policy if exists "Ver mi historial de monedas" on public.coin_ledger;
create policy "Ver mi historial de monedas" on public.coin_ledger for select to authenticated using (account_id = (select auth.uid()));
-- wager_escrows: sin politicas, solo el servidor.

-- Precio del slot numero n (null = ya no se pueden comprar mas).
create or replace function public.pb_slot_price(p_slot integer)
returns integer language sql immutable set search_path = '' as $$
 select case p_slot when 5 then 200 when 6 then 350 when 7 then 500 when 8 then 750
   when 9 then 1000 when 10 then 1250 when 11 then 1500 when 12 then 2000 else null end
$$;

-- Crea el monedero si falta. Conserva todos los luchadores existentes: slots = max(4, luchadores actuales).
create or replace function public.pb_ensure_wallet(p_account uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_rows integer;
begin
 select count(*) into v_count from public.fighters where owner_id = p_account;
 insert into public.player_wallets(account_id, coins, character_slots, lifetime_earned)
 values (p_account, 300, greatest(4, v_count), 300)
 on conflict (account_id) do nothing;
 get diagnostics v_rows = row_count;
 if v_rows > 0 then
  insert into public.coin_ledger(account_id, delta, balance_after, kind, ref)
  values (p_account, 300, 300, 'welcome', 'welcome') on conflict do nothing;
 end if;
end $$;

-- Abona (o cobra) monedas de forma idempotente por (cuenta, tipo, ref). Devuelve el saldo, o null si ya estaba aplicado.
create or replace function public.pb_credit(p_account uuid, p_delta integer, p_kind text, p_ref text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_balance integer;
begin
 perform public.pb_ensure_wallet(p_account);
 perform 1 from public.player_wallets where account_id = p_account for update;
 if exists (select 1 from public.coin_ledger where account_id = p_account and kind = p_kind and ref = p_ref) then
  return null;
 end if;
 update public.player_wallets set coins = coins + p_delta,
   lifetime_earned = lifetime_earned + greatest(p_delta, 0),
   lifetime_spent = lifetime_spent + greatest(-p_delta, 0), updated_at = now()
  where account_id = p_account returning coins into v_balance;
 insert into public.coin_ledger(account_id, delta, balance_after, kind, ref) values (p_account, p_delta, v_balance, p_kind, p_ref);
 return v_balance;
end $$;

create or replace function public.pb_rewarded_today(p_account uuid)
returns integer language sql stable security definer set search_path = '' as $$
 select count(*)::integer from public.coin_ledger
 where account_id = p_account and kind = 'match_reward'
   and (created_at at time zone 'Europe/Madrid')::date = (now() at time zone 'Europe/Madrid')::date
$$;

-- Estado del monedero del usuario autenticado (lo crea si falta).
create or replace function public.economy_wallet()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); w public.player_wallets%rowtype; v_used integer;
begin
 if v_uid is null then raise exception 'Inicia sesion para ver tus monedas.'; end if;
 perform public.pb_ensure_wallet(v_uid);
 select * into w from public.player_wallets where account_id = v_uid;
 select count(*) into v_used from public.fighters where owner_id = v_uid;
 return jsonb_build_object('coins', w.coins, 'slots', w.character_slots, 'used', v_used,
   'next_price', public.pb_slot_price(w.character_slots + 1), 'max_slots', 12,
   'rewarded_today', public.pb_rewarded_today(v_uid), 'daily_cap', 10);
end $$;

create or replace function public.economy_buy_slot()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); w public.player_wallets%rowtype; v_price integer;
begin
 if v_uid is null then raise exception 'Inicia sesion para comprar un slot.'; end if;
 perform public.pb_ensure_wallet(v_uid);
 select * into w from public.player_wallets where account_id = v_uid for update;
 v_price := public.pb_slot_price(w.character_slots + 1);
 if v_price is null then raise exception 'Ya tienes el maximo de slots.' using hint = 'SLOTS_MAX'; end if;
 if w.coins < v_price then raise exception 'Te faltan % monedas para este slot.', v_price - w.coins using hint = 'COINS_INSUFFICIENT'; end if;
 perform public.pb_credit(v_uid, -v_price, 'slot_purchase', (w.character_slots + 1)::text);
 update public.player_wallets set character_slots = character_slots + 1, updated_at = now() where account_id = v_uid;
 return public.economy_wallet();
end $$;

-- Limite real en la base de datos: nuevo luchador o luchador recibido por transferencia necesita un slot libre.
create or replace function public.pb_enforce_fighter_slots()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_slots integer; v_used integer;
begin
 if tg_op = 'UPDATE' and new.owner_id is not distinct from old.owner_id then return new; end if;
 perform public.pb_ensure_wallet(new.owner_id);
 select character_slots into v_slots from public.player_wallets where account_id = new.owner_id for update;
 select count(*) into v_used from public.fighters where owner_id = new.owner_id;
 if v_used >= v_slots then
  raise exception 'No tienes hueco libre en tu coleccion (% de % slots). Compra un slot con monedas o borra un luchador.', v_used, v_slots using hint = 'SLOTS_FULL';
 end if;
 return new;
end $$;
drop trigger if exists fighters_slot_limit on public.fighters;
create trigger fighters_slot_limit before insert or update of owner_id on public.fighters
for each row execute function public.pb_enforce_fighter_slots();

-- ===== Solo servidor (service_role) =====
create or replace function public.economy_wallet_for(p_account uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w public.player_wallets%rowtype;
begin
 perform public.pb_ensure_wallet(p_account);
 select * into w from public.player_wallets where account_id = p_account;
 return jsonb_build_object('coins', w.coins, 'slots', w.character_slots);
end $$;

create or replace function public.economy_lock_wager(p_match uuid, p_host uuid, p_guest uuid, p_stake integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_host integer; v_guest integer;
begin
 if p_stake is null or p_stake < 1 or p_stake > 100 or p_host is null or p_guest is null or p_host = p_guest then
  return jsonb_build_object('ok', false, 'reason', 'invalid');
 end if;
 if exists (select 1 from public.wager_escrows where match_id = p_match) then
  return jsonb_build_object('ok', true, 'duplicate', true, 'stake', p_stake);
 end if;
 perform public.pb_ensure_wallet(p_host); perform public.pb_ensure_wallet(p_guest);
 perform 1 from public.player_wallets where account_id in (p_host, p_guest) order by account_id for update;
 select coins into v_host from public.player_wallets where account_id = p_host;
 select coins into v_guest from public.player_wallets where account_id = p_guest;
 if v_host < p_stake then return jsonb_build_object('ok', false, 'reason', 'host_insufficient'); end if;
 if v_guest < p_stake then return jsonb_build_object('ok', false, 'reason', 'guest_insufficient'); end if;
 insert into public.wager_escrows(match_id, host_id, guest_id, stake) values (p_match, p_host, p_guest, p_stake);
 perform public.pb_credit(p_host, -p_stake, 'wager_stake', p_match::text);
 perform public.pb_credit(p_guest, -p_stake, 'wager_stake', p_match::text);
 return jsonb_build_object('ok', true, 'stake', p_stake);
end $$;

-- Paga el bote al ganador del escrow. Idempotente.
create or replace function public.pb_pay_escrow(p_match uuid, p_winner_side text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.wager_escrows%rowtype; v_winner uuid; v_loser uuid;
begin
 select * into e from public.wager_escrows where match_id = p_match for update;
 if not found or e.status <> 'locked' then return null; end if;
 v_winner := case when p_winner_side = 'host' then e.host_id else e.guest_id end;
 v_loser := case when p_winner_side = 'host' then e.guest_id else e.host_id end;
 perform public.pb_credit(v_winner, e.stake * 2, 'wager_win', p_match::text);
 update public.wager_escrows set status = 'settled', winner_id = v_winner, settle_reason = p_reason, settled_at = now() where match_id = p_match;
 return jsonb_build_object('stake', e.stake, 'winner', p_winner_side, 'reason', p_reason);
end $$;

create or replace function public.pb_reward_match(p_match uuid, p_account uuid, p_amount integer)
returns integer language plpgsql security definer set search_path = '' as $$
begin
 perform public.pb_ensure_wallet(p_account);
 if public.pb_rewarded_today(p_account) >= 10 then return 0; end if;
 if public.pb_credit(p_account, p_amount, 'match_reward', p_match::text) is null then return 0; end if;
 return p_amount;
end $$;

-- Liquida el 1 vs 1: paga la apuesta (si existe) y concede el premio de la partida (si el resultado puntuo).
create or replace function public.economy_settle_match(p_match uuid, p_host uuid, p_guest uuid, p_host_rounds integer, p_guest_rounds integer, p_reward boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_side text; v_pay jsonb; v_hr integer := 0; v_gr integer := 0; v_hb integer; v_gb integer; v_stake integer := 0;
begin
 if p_host = p_guest or not ((p_host_rounds = 2 and p_guest_rounds between 0 and 1) or (p_guest_rounds = 2 and p_host_rounds between 0 and 1)) then
  raise exception 'Resultado no valido';
 end if;
 v_side := case when p_host_rounds = 2 then 'host' else 'guest' end;
 perform public.pb_ensure_wallet(p_host); perform public.pb_ensure_wallet(p_guest);
 perform 1 from public.player_wallets where account_id in (p_host, p_guest) order by account_id for update;
 v_pay := public.pb_pay_escrow(p_match, v_side, 'played');
 if p_reward then
  v_hr := public.pb_reward_match(p_match, p_host, case when v_side = 'host' then 25 else 10 end);
  v_gr := public.pb_reward_match(p_match, p_guest, case when v_side = 'guest' then 25 else 10 end);
 end if;
 if v_pay is not null then v_stake := (v_pay->>'stake')::integer; end if;
 select coins into v_hb from public.player_wallets where account_id = p_host;
 select coins into v_gb from public.player_wallets where account_id = p_guest;
 return jsonb_build_object('settled', true, 'winner', v_side, 'stake', v_stake,
  'host', jsonb_build_object('reward', v_hr, 'wager', case when v_stake = 0 then 0 when v_side = 'host' then v_stake else -v_stake end, 'balance', v_hb),
  'guest', jsonb_build_object('reward', v_gr, 'wager', case when v_stake = 0 then 0 when v_side = 'guest' then v_stake else -v_stake end, 'balance', v_gb));
end $$;

-- Abandono o desconexion definitiva durante una partida apostada: pierde quien se va.
create or replace function public.economy_forfeit_wager(p_match uuid, p_loser uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.wager_escrows%rowtype; v_side text; v_pay jsonb;
begin
 select * into e from public.wager_escrows where match_id = p_match;
 if not found or e.status <> 'locked' then return jsonb_build_object('settled', false); end if;
 if p_loser = e.host_id then v_side := 'guest'; elsif p_loser = e.guest_id then v_side := 'host';
 else raise exception 'Jugador no valido'; end if;
 perform 1 from public.player_wallets where account_id in (e.host_id, e.guest_id) order by account_id for update;
 v_pay := public.pb_pay_escrow(p_match, v_side, 'forfeit');
 return jsonb_build_object('settled', v_pay is not null, 'winner', v_side, 'stake', e.stake);
end $$;

create or replace function public.economy_refund_wager(p_match uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.wager_escrows%rowtype;
begin
 select * into e from public.wager_escrows where match_id = p_match for update;
 if not found or e.status <> 'locked' then return jsonb_build_object('refunded', false); end if;
 perform 1 from public.player_wallets where account_id in (e.host_id, e.guest_id) order by account_id for update;
 perform public.pb_credit(e.host_id, e.stake, 'wager_refund', p_match::text);
 perform public.pb_credit(e.guest_id, e.stake, 'wager_refund', p_match::text);
 update public.wager_escrows set status = 'refunded', settle_reason = 'refund', settled_at = now() where match_id = p_match;
 return jsonb_build_object('refunded', true, 'stake', e.stake);
end $$;

create or replace function public.economy_refund_stale(p_older_minutes integer default 45)
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; v_count integer := 0;
begin
 for r in select match_id from public.wager_escrows
   where status = 'locked' and created_at < now() - make_interval(mins => greatest(p_older_minutes, 0)) order by created_at loop
  if (public.economy_refund_wager(r.match_id)->>'refunded')::boolean then v_count := v_count + 1; end if;
 end loop;
 return v_count;
end $$;

-- Premios de una partida de 4 jugadores (puestos 1..4).
create or replace function public.economy_reward_group(p_match uuid, p_players uuid[], p_places integer[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i integer; v_out jsonb := '[]'::jsonb; v_amount integer; v_given integer;
begin
 if array_length(p_players, 1) <> 4 or array_length(p_places, 1) <> 4 then raise exception 'Resultado no valido'; end if;
 for i in 1..4 loop
  v_amount := case p_places[i] when 1 then 30 when 2 then 20 when 3 then 12 else 8 end;
  v_given := public.pb_reward_match(p_match, p_players[i], v_amount);
  v_out := v_out || jsonb_build_array(jsonb_build_object('seat', i - 1, 'reward', v_given,
    'balance', (select coins from public.player_wallets where account_id = p_players[i])));
 end loop;
 return jsonb_build_object('players', v_out);
end $$;

revoke all on function public.pb_slot_price(integer), public.pb_ensure_wallet(uuid), public.pb_credit(uuid,integer,text,text),
 public.pb_rewarded_today(uuid), public.pb_enforce_fighter_slots(), public.economy_wallet_for(uuid),
 public.economy_lock_wager(uuid,uuid,uuid,integer), public.pb_pay_escrow(uuid,text,text), public.pb_reward_match(uuid,uuid,integer),
 public.economy_settle_match(uuid,uuid,uuid,integer,integer,boolean), public.economy_forfeit_wager(uuid,uuid),
 public.economy_refund_wager(uuid), public.economy_refund_stale(integer), public.economy_reward_group(uuid,uuid[],integer[])
 from public, anon, authenticated;
grant execute on function public.economy_wallet_for(uuid), public.economy_lock_wager(uuid,uuid,uuid,integer),
 public.economy_settle_match(uuid,uuid,uuid,integer,integer,boolean), public.economy_forfeit_wager(uuid,uuid),
 public.economy_refund_wager(uuid), public.economy_refund_stale(integer), public.economy_reward_group(uuid,uuid[],integer[]) to service_role;
revoke all on function public.economy_wallet(), public.economy_buy_slot() from public, anon;
grant execute on function public.economy_wallet(), public.economy_buy_slot() to authenticated;

-- Cuentas existentes: monedero inicial sin quitar ningun luchador.
select public.pb_ensure_wallet(id) from public.player_profiles;
