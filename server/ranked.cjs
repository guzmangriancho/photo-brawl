'use strict';
/** Only the authoritative combat server may confirm a ranked result.
 * API keys never pass through the browser or websocket response.
 */
const URL_ROOT=(process.env.SUPABASE_URL||'').trim().replace(/\/+$/,'');
const PUBLIC_KEY=(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'').trim();
const SECRET_KEY=(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
const configured=Boolean(/^https:\/\/[^/]+/.test(URL_ROOT)&&PUBLIC_KEY&&SECRET_KEY);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function available(){return configured;}
async function verifyUser(accessToken){
  if(!configured)throw new Error('Las clasificatorias todavía no están configuradas en Render.');
  if(typeof accessToken!=='string'||accessToken.length>8192||accessToken.length<30)throw new Error('Inicia sesión en PHOTO BRAWL para jugar una clasificatoria.');
  let response;
  try{
    response=await fetch(URL_ROOT+'/auth/v1/user',{headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+accessToken},signal:AbortSignal.timeout(6500)});
  }catch{throw new Error('No se pudo verificar la cuenta. Reintenta la conexión.');}
  if(!response.ok)throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
  const payload=await response.json();
  if(!uuid.test(payload?.id||''))throw new Error('La cuenta verificada no es válida.');
  return payload.id;
}
async function recordResult({id,hostId,guestId,hostRounds,guestRounds,stage}){
  if(!configured)throw new Error('Clasificatorias no configuradas.');
  if(!uuid.test(id)||!uuid.test(hostId)||!uuid.test(guestId)||hostId===guestId)throw new Error('Identidades de partida inválidas.');
  if(!((hostRounds===2&&guestRounds>=0&&guestRounds<=1)||(guestRounds===2&&hostRounds>=0&&hostRounds<=1)))throw new Error('Marcador no válido.');
  const body={p_match_id:id,p_host_id:hostId,p_guest_id:guestId,p_host_rounds:hostRounds,p_guest_rounds:guestRounds,p_stage:stage,p_result_type:'played'};
  let response;
  try{
    // Modern sb_secret keys belong in apikey, NOT as Bearer tokens.
    response=await fetch(URL_ROOT+'/rest/v1/rpc/record_ranked_match',{
      method:'POST',headers:{apikey:SECRET_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(9000),
    });
  }catch{throw new Error('No se pudo guardar el resultado en Supabase.');}
  if(!response.ok){const text=(await response.text()).slice(0,240);throw new Error(`Supabase no aceptó el resultado (${response.status}): ${text}`);}
  return response.json();
}
/** Only ranked, authenticated four-human rooms may invoke this RPC. */
async function recordGroupResult({id,mode,accountIds,places,stage,winningTeam}){
  if(!configured)throw new Error('ELO online no configurado.');
  if(!uuid.test(id)||!['2V2','FREE_FOR_ALL'].includes(mode)||
     !Array.isArray(accountIds)||accountIds.length!==4||
     accountIds.some(a=>!uuid.test(a))||new Set(accountIds).size!==4||
     !Array.isArray(places)||places.length!==4||places.some(v=>!Number.isInteger(v)||v<1||v>4))
    throw new Error('Resultado de cuatro jugadores inválido.');
  if(mode==='2V2' && ![null,'RED','BLUE'].includes(winningTeam))throw new Error('Equipo ganador inválido.');
  const body={p_match_id:id,p_mode:mode,p_player_ids:accountIds,p_places:places,
    p_stage:stage,p_winning_team:mode==='2V2'?winningTeam:null};
  let response;
  try{response=await fetch(URL_ROOT+'/rest/v1/rpc/record_group_ranked_match',{
    method:'POST',headers:{apikey:SECRET_KEY,'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(9000),
  });}catch{throw new Error('No se pudo registrar el ELO del combate múltiple.');}
  if(!response.ok){const detail=(await response.text()).slice(0,220);
    throw new Error(`Supabase rechazó el ELO de grupos (${response.status}): ${detail}`);}
  return response.json();
}
module.exports={available,verifyUser,recordResult,recordGroupResult};
