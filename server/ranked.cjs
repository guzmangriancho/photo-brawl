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
/** Ranked fighters must belong to the JWT-verified account, NOT merely be
 * tagged as local by a browser. The service key is server-only. */
async function verifyRankedFighter(accountId,profile){
  if(!configured)throw new Error('Clasificatorias no configuradas.');
  if(!uuid.test(accountId)||!profile||typeof profile.id!=='string'||
     profile.id.startsWith('community_')||profile.id.length>70)
    throw new Error('Clasificatorio: solo puedes usar tus propios luchadores.');
  const params=new URLSearchParams({select:'id,fighter_data',owner_id:`eq.${accountId}`,local_id:`eq.${profile.id}`,limit:'1'});
  const headers={apikey:SECRET_KEY};
  // Older service_role JWTs need Authorization; modern sb_secret keys don't.
  if(!SECRET_KEY.startsWith('sb_secret_'))headers.Authorization=`Bearer ${SECRET_KEY}`;
  let response;
  try{response=await fetch(`${URL_ROOT}/rest/v1/fighters?${params}`,{
    headers,signal:AbortSignal.timeout(6500),
  });}catch{throw new Error('No se pudo comprobar la propiedad del luchador.');}
  if(!response.ok)throw new Error(`No se pudo comprobar el luchador (${response.status}).`);
  const rows=await response.json();
  const fighterRow=Array.isArray(rows)?rows[0]:null;
  const original=fighterRow?.fighter_data;
  if(!original)throw new Error('Este luchador aún no está sincronizado en tu cuenta. Sincronízalo antes de jugar clasificatorias.');
  // An Ultimate is a server-approved, non-pay-to-win VARIANT of the same base fighter.
  // The browser cannot grant itself Ultimate by setting an arbitrary boolean or score.
  let approved=original;
  if(profile.ultimateForm===true){
    const query=new URLSearchParams({select:'design',fighter_id:`eq.${fighterRow.id}`,owner_id:`eq.${accountId}`,limit:'1'});
    let result;
    try{result=await fetch(`${URL_ROOT}/rest/v1/fighter_ultimate_forms?${query}`,{headers,signal:AbortSignal.timeout(6500)});}
    catch{throw new Error('No se pudo verificar el Despertar en Supabase.');}
    if(!result.ok)throw new Error('No se pudo validar la evolución Ultimate. Comprueba la migración V57.');
    const ultimate=await result.json();
    if(!Array.isArray(ultimate)||!ultimate[0]?.design)throw new Error('Forma Ultimate no desbloqueada/guardada para esta cuenta.');
    approved=ultimate[0].design;
  }
  const sameStats=['hp','speed','power','technique'].every(k=>approved.stats?.[k]===profile.stats?.[k]);
  const specs=[['lightNormal','style'],['heavyNormal','style'],['specialNeutral','mechanic'],
    ['specialForward','mechanic'],['specialUp','mechanic'],['ultimateSuper','mechanic']];
  const sameMoves=specs.every(([key,field])=>approved.moveset?.[key]?.[field]===profile.moveset?.[key]?.[field]);
  if(!sameStats||!sameMoves||approved.archetype!==profile.archetype||approved.passiveTrait!==profile.passiveTrait)
    throw new Error('Los movimientos o estadísticas no coinciden con tu luchador guardado. Sincroniza tu colección.');
  return true;
}
async function recordResult({id,hostId,guestId,hostRounds,guestRounds,stage,hostFighterId,guestFighterId}){
  if(!configured)throw new Error('Clasificatorias no configuradas.');
  if(!uuid.test(id)||!uuid.test(hostId)||!uuid.test(guestId)||hostId===guestId)throw new Error('Identidades de partida inválidas.');
  if(!((hostRounds===2&&guestRounds>=0&&guestRounds<=1)||(guestRounds===2&&hostRounds>=0&&hostRounds<=1)))throw new Error('Marcador no válido.');
  const withFighters=typeof hostFighterId==='string'&&typeof guestFighterId==='string';
  if((hostFighterId!==undefined||guestFighterId!==undefined)&&(!withFighters||!hostFighterId||!guestFighterId||hostFighterId.length>100||guestFighterId.length>100))throw new Error('Identidades de luchadores inválidas.');
  const body={p_match_id:id,p_host_id:hostId,p_guest_id:guestId,p_host_rounds:hostRounds,p_guest_rounds:guestRounds,p_stage:stage,p_result_type:'played',
    ...(withFighters?{p_host_fighter_local_id:hostFighterId,p_guest_fighter_local_id:guestFighterId}:{})};
  let response;
  try{
    // Modern sb_secret keys belong in apikey, NOT as Bearer tokens.
    response=await fetch(URL_ROOT+(withFighters?'/rest/v1/rpc/record_ranked_progress_match':'/rest/v1/rpc/record_ranked_match'),{
      method:'POST',headers:{apikey:SECRET_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(9000),
    });
  }catch{throw new Error('No se pudo guardar el resultado en Supabase.');}
  if(!response.ok){const text=(await response.text()).slice(0,240);throw new Error(`Supabase no aceptó el resultado (${response.status}): ${text}`);}
  return response.json();
}
/** Only ranked, authenticated four-human rooms may invoke this RPC. */
async function recordGroupResult({id,mode,accountIds,places,stage,winningTeam,fighterIds}){
  if(!configured)throw new Error('ELO online no configurado.');
  if(!uuid.test(id)||!['2V2','FREE_FOR_ALL'].includes(mode)||
     !Array.isArray(accountIds)||accountIds.length!==4||
     accountIds.some(a=>!uuid.test(a))||new Set(accountIds).size!==4||
     !Array.isArray(places)||places.length!==4||places.some(v=>!Number.isInteger(v)||v<1||v>4))
    throw new Error('Resultado de cuatro jugadores inválido.');
  if(mode==='2V2' && ![null,'RED','BLUE'].includes(winningTeam))throw new Error('Equipo ganador inválido.');
  const withFighters=Array.isArray(fighterIds);
  if(withFighters&&(fighterIds.length!==4||fighterIds.some(f=>typeof f!=='string'||!f||f.length>100)))throw new Error('Luchadores de grupo inválidos.');
  const body={p_match_id:id,p_mode:mode,p_player_ids:accountIds,p_places:places,
    p_stage:stage,p_winning_team:mode==='2V2'?winningTeam:null,
    ...(withFighters?{p_fighter_local_ids:fighterIds}:{})};
  let response;
  try{response=await fetch(URL_ROOT+(withFighters?'/rest/v1/rpc/record_group_ranked_progress_match':'/rest/v1/rpc/record_group_ranked_match'),{
    method:'POST',headers:{apikey:SECRET_KEY,'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(9000),
  });}catch{throw new Error('No se pudo registrar el ELO del combate múltiple.');}
  if(!response.ok){const detail=(await response.text()).slice(0,220);
    throw new Error(`Supabase rechazó el ELO de grupos (${response.status}): ${detail}`);}
  return response.json();
}
/** Read-only badge metadata, checked against the verified account and local fighter ID.
 * An unavailable badge never blocks gameplay; the SQL RPC is still authoritative. */
async function getFighterTrophies(accountId,profile){
  if(!configured||!uuid.test(accountId)||typeof profile?.id!=='string')return 0;
  const headers={apikey:SECRET_KEY};
  if(!SECRET_KEY.startsWith('sb_secret_'))headers.Authorization=`Bearer ${SECRET_KEY}`;
  const params=new URLSearchParams({select:'id,fighter_progress(trophies)',owner_id:`eq.${accountId}`,local_id:`eq.${profile.id}`,limit:'1'});
  try{
    const response=await fetch(`${URL_ROOT}/rest/v1/fighters?${params}`,{headers,signal:AbortSignal.timeout(4000)});
    if(!response.ok)return 0;
    const rows=await response.json();
    const progress=rows?.[0]?.fighter_progress;
    const cups=Array.isArray(progress)?progress[0]?.trophies:progress?.trophies;
    return Number.isSafeInteger(cups)&&cups>=0?cups:0;
  }catch{return 0;}
}
module.exports={available,verifyUser,verifyRankedFighter,recordResult,recordGroupResult,getFighterTrophies};
