'use strict';
/** Monedas y apuestas virtuales. Solo el servidor de combate (clave secreta) puede
 * bloquear, liquidar o conceder monedas. Si la migración V62 no está aplicada o la
 * base de datos falla, el juego sigue funcionando sin apuestas ni premios. */
const URL_ROOT=(process.env.SUPABASE_URL||'').trim().replace(/\/+$/,'');
const SECRET_KEY=(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
const configured=Boolean(/^https:\/\/[^/]+/.test(URL_ROOT)&&SECRET_KEY);
const WAGER_STEPS=[0,10,25,50,100];
function available(){return configured;}
async function rpc(name,body,timeout=9000){
  if(!configured)throw new Error('Economía no configurada.');
  const headers={apikey:SECRET_KEY,'Content-Type':'application/json'};
  if(!SECRET_KEY.startsWith('sb_secret_'))headers.Authorization=`Bearer ${SECRET_KEY}`;
  let response;
  try{response=await fetch(`${URL_ROOT}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});}
  catch{throw new Error('No se pudo contactar con Supabase.');}
  if(!response.ok){const text=(await response.text()).slice(0,200);throw new Error(`Supabase rechazó ${name} (${response.status}): ${text}`);}
  return response.json();
}
const wallet=accountId=>rpc('economy_wallet_for',{p_account:accountId},6500);
const lockWager=({id,hostId,guestId,stake})=>rpc('economy_lock_wager',{p_match:id,p_host:hostId,p_guest:guestId,p_stake:stake});
const settleMatch=({id,hostId,guestId,hostRounds,guestRounds,reward})=>rpc('economy_settle_match',
  {p_match:id,p_host:hostId,p_guest:guestId,p_host_rounds:hostRounds,p_guest_rounds:guestRounds,p_reward:reward===true});
const forfeitWager=({id,loserId})=>rpc('economy_forfeit_wager',{p_match:id,p_loser:loserId});
const refundWager=id=>rpc('economy_refund_wager',{p_match:id});
const refundStale=minutes=>rpc('economy_refund_stale',{p_older_minutes:minutes});
const rewardGroup=({id,accountIds,places})=>rpc('economy_reward_group',{p_match:id,p_players:accountIds,p_places:places});
module.exports={WAGER_STEPS,available,wallet,lockWager,settleMatch,forfeitWager,refundWager,refundStale,rewardGroup};
