const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const p=require('path');
const read=f=>fs.readFileSync(p.join(__dirname,'..',f),'utf8');
test('migración V62 define monedero, ledger, escrow y límite de slots',()=>{
  const sql=read('supabase/migrations/202611240001_v62_economy.sql');
  for(const k of['player_wallets','coin_ledger','wager_escrows','economy_buy_slot','fighters_slot_limit','settle_match','refund_stale'])assert.match(sql,new RegExp(k));
  assert.match(sql,/greatest\(4/i,'slots heredados de usuarios existentes');
});
test('el cliente solo lee monedero y compra slots por RPC; no concede monedas',()=>{
  const s=read('src/services/economyService.ts');
  assert.match(s,/rpc\('economy_wallet'\)/);assert.match(s,/rpc\('economy_buy_slot'\)/);
  assert.doesNotMatch(s,/settle_match|reward_group|lock_wager/);
});
test('la interfaz está conectada sin pantallas nuevas',()=>{
  const cs=read('src/components/CharacterSelect.tsx');
  assert.match(cs,/slotsFull/);assert.match(cs,/<SlotShop/);assert.match(cs,/pb-coin-chip/);
  assert.match(read('src/components/OnlineLobby.tsx'),/pb-online-wager/);
  assert.match(read('src/components/FightArena.tsx'),/online\.on\('economy'/);
  assert.match(read('src/network/OnlineSession.ts'),/type:'wager'/);
});
