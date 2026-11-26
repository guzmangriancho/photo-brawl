'use strict';
/** Torneos por rondas. Todo pasa por aquí con la clave secreta: los clientes nunca tocan las tablas.
 * - Las horas las decide el reloj de la base de datos (funciones pb_tournament_*).
 * - Cada transición es atómica y repetible; solo un proceso simula a la vez (arrendamiento en la BD).
 * - Las tácticas del rival no salen de aquí hasta que la ronda está completa y destapada. */
const {randomUUID}=require('node:crypto');
const sim=require('./sim.cjs');
const video=require('./video.cjs');
const rankedApi=require('../ranked.cjs');
const {validateProfile}=require('../validation.cjs');
const {normalizeCpuTactics}=require('../runtime/engine/cpuTactics.js');

const URL_ROOT=(process.env.SUPABASE_URL||'').trim().replace(/\/+$/,'');
const SECRET_KEY=(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
const configured=Boolean(/^https:\/\/[^/]+/.test(URL_ROOT)&&SECRET_KEY);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const LIVE='in.(registration,round_open,simulating)';
const TICK_BUDGET_MS=Number(process.env.TOURNAMENT_TICK_BUDGET_MS||40000);
const BATCH=Number(process.env.TOURNAMENT_BATCH||100);
const LOCK_SECONDS=180;

function headers(extra){
  const h={apikey:SECRET_KEY,...(extra||{})};
  if(!SECRET_KEY.startsWith('sb_secret_'))h.Authorization=`Bearer ${SECRET_KEY}`;
  return h;
}
async function rest(path,{method='GET',body,prefer,timeout=12000}={}){
  if(!configured)throw new Error('Torneos no configurados.');
  const h=headers({'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})});
  const r=await fetch(`${URL_ROOT}/rest/v1/${path}`,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
  if(!r.ok)throw new Error(`Supabase ${method} ${path.split('?')[0]} ${r.status}: ${(await r.text()).slice(0,200)}`);
  if(prefer&&prefer.includes('count=exact')){const range=r.headers.get('content-range')||'';return {rows:await r.json(),count:Number(range.split('/')[1])||0};}
  const text=await r.text();return text?JSON.parse(text):null;
}
const rpc=(name,body)=>rest(`rpc/${name}`,{method:'POST',body});
const publicUrl=path=>`${URL_ROOT}/storage/v1/object/public/tournament-fighters/${path}`;

// ---------- Vistas públicas ----------
function publicEntry(e){
  if(!e)return null;
  return {id:e.id,name:e.display_name,instagram:e.instagram||null,status:e.status,eliminatedRound:e.eliminated_round??null,
    fighter:e.fighter_data,portraitUrl:publicUrl(e.portrait_path),sheetUrl:publicUrl(e.sheet_path)};
}
const ENTRY_COLS='id,account_id,display_name,instagram,status,eliminated_round,fighter_data,portrait_path,sheet_path,tournament_id';
async function entriesByIds(ids){
  if(!ids.length)return new Map();
  const rows=await rest(`tournament_entries?select=${ENTRY_COLS}&id=in.(${ids.join(',')})`);
  return new Map(rows.map(r=>[r.id,r]));
}
function tournamentView(t,extra){
  return {id:t.id,kind:t.kind||'real',label:t.label||null,status:t.status,stage:t.stage,difficulty:t.difficulty,roundNo:t.round_no,roundCount:t.round_count,revealedRound:t.revealed_round,
    roundCutoff:t.round_cutoff,registrationOpensAt:t.registration_opens_at,registrationClosesAt:t.registration_closes_at,extended:t.extended,
    entrantCount:t.entrant_count,windowMinutes:t.window_minutes,schedule:t.schedule,finishedAt:t.finished_at,...extra};
}
async function liveCount(tid){
  const r=await rest(`tournament_entries?select=id&tournament_id=eq.${tid}`,{prefer:'count=exact',timeout:8000});
  return r.count;
}
async function aliveCount(tid){
  const r=await rest(`tournament_entries?select=id&tournament_id=eq.${tid}&status=neq.eliminated`,{prefer:'count=exact',timeout:8000});
  return r.count;
}
async function matchCounts(tid,round){
  const total=await rest(`tournament_matches?select=id&tournament_id=eq.${tid}&round_no=eq.${round}`,{prefer:'count=exact',timeout:8000});
  const done=await rest(`tournament_matches?select=id&tournament_id=eq.${tid}&round_no=eq.${round}&status=eq.resolved`,{prefer:'count=exact',timeout:8000});
  return {total:total.count,resolved:done.count};
}
function matchResult(m,mineId,revealedRound){
  const revealed=m.status==='resolved'&&m.round_no<=revealedRound;
  return {id:m.id,round:m.round_no,slot:m.slot,revealed,
    ...(revealed?{winnerEntryId:m.winner_entry,scoreA:m.score_a,scoreB:m.score_b,decidedBy:m.decided_by,entryA:m.entry_a,entryB:m.entry_b}:{entryA:m.entry_a,entryB:m.entry_b})};
}
const MATCH_PUBLIC='id,round_no,slot,entry_a,entry_b,status,winner_entry,score_a,score_b,decided_by';

/** Estado del torneo para una cuenta verificada. Nunca incluye tácticas ajenas. */
async function stateFor(accountId){
  const [live]=await rest(`tournaments?select=*&status=${LIVE}&limit=1`);
  const [last]=await rest('tournaments?select=*&status=eq.finished&order=finished_at.desc&limit=1');
  const t=live||last||null;
  const out={now:new Date().toISOString(),tournament:null,previous:null,me:null,myMatch:null,history:[],progress:null,champion:null};
  if(last&&live){
    const champ=last.champion_entry_id?(await entriesByIds([last.champion_entry_id])).get(last.champion_entry_id):null;
    out.previous={...tournamentView(last),champion:publicEntry(champ)};
  }
  if(!t)return out;
  const count=t.status==='registration'?await liveCount(t.id):t.entrant_count;
  out.tournament=tournamentView(t,{entrantCount:count});
  if(t.status==='finished'&&t.champion_entry_id){
    out.champion=publicEntry((await entriesByIds([t.champion_entry_id])).get(t.champion_entry_id));
  }
  const [me]=await rest(`tournament_entries?select=${ENTRY_COLS}&tournament_id=eq.${t.id}&account_id=eq.${accountId}&limit=1`);
  if(me){
    const [tac]=await rest(`tournament_entry_tactics?select=tactics,updated_at&entry_id=eq.${me.id}&limit=1`);
    out.me={entry:publicEntry(me),tactics:normalizeCpuTactics(tac?.tactics),tacticsUpdatedAt:tac?.updated_at||null};
    if(t.status!=='registration'){
      const mine=await rest(`tournament_matches?select=${MATCH_PUBLIC}&tournament_id=eq.${t.id}&or=(entry_a.eq.${me.id},entry_b.eq.${me.id})&order=round_no.asc&limit=64`);
      const ids=[...new Set(mine.flatMap(m=>[m.entry_a,m.entry_b]).filter(x=>x!==me.id))];
      const others=await entriesByIds(ids);
      for(const m of mine){
        const oppId=m.entry_a===me.id?m.entry_b:m.entry_a;
        const view={...matchResult(m,me.id,t.revealed_round),youAre:m.entry_a===me.id?'a':'b',opponent:publicEntry(others.get(oppId))};
        if(view.revealed)out.history.push(view);
        else if(m.round_no===t.round_no&&t.status!=='finished')out.myMatch=view; // el rival se ve (stats y ataques), sus tácticas no
      }
    }
    out.progress=t.status==='registration'?null:{...(await matchCounts(t.id,t.round_no)),alive:await aliveCount(t.id)};
  }else if(t.status!=='registration'&&t.status!=='finished'){
    out.progress={...(await matchCounts(t.id,t.round_no)),alive:await aliveCount(t.id)};
  }
  return out;
}

async function bracket(tid,round,offset){
  const [t]=await rest(`tournaments?select=*&id=eq.${tid}&limit=1`);
  if(!t)throw new Error('Torneo no encontrado.');
  // Cuadro del torneo en marcha: se ven los cruces de la ronda en juego (sin resultados ni tacticas); los resultados solo al destaparse.
  const visibleRound=t.status==='registration'||t.status==='cancelled'?0:t.status==='finished'?t.revealed_round:Math.max(t.revealed_round,t.round_no||0);
  if(!(round>=1)||round>visibleRound)return {round,matches:[],total:0};
  const r=await rest(`tournament_matches?select=${MATCH_PUBLIC}&tournament_id=eq.${tid}&round_no=eq.${round}&order=slot.asc&limit=40&offset=${offset|0}`,{prefer:'count=exact'});
  const ents=await entriesByIds([...new Set(r.rows.flatMap(m=>[m.entry_a,m.entry_b]))]);
  // Quienes se saltan la ronda previa (aun no estan en ningun combate de la ronda 1): se listan para poder pintar su casilla "pasa directo".
  let byes;
  if(round===1&&t.prelim_count>0&&offset<=0){
    const rows=await rest(`tournament_entries?select=id&tournament_id=eq.${tid}&slot=gte.${2*t.prelim_count}&limit=200`);
    const be=await entriesByIds(rows.map(x=>x.id));
    byes=rows.map(x=>{const e=publicEntry(be.get(x.id));return e&&{id:e.id,name:e.name,portraitUrl:e.portraitUrl};}).filter(Boolean);
  }
  return {round,total:r.count,...(byes?{byes}:{}),matches:r.rows.map(m=>({...matchResult(m,null,t.revealed_round),a:publicEntry(ents.get(m.entry_a))?.name,b:publicEntry(ents.get(m.entry_b))?.name,aPortrait:publicEntry(ents.get(m.entry_a))?.portraitUrl,bPortrait:publicEntry(ents.get(m.entry_b))?.portraitUrl}))};
}

/** Combate destapado con todo lo necesario para recrearlo (luchadores congelados + tácticas congeladas + semilla). */
async function matchDetail(id){
  if(!uuid.test(id))throw new Error('Combate no válido.');
  const [m]=await rest(`tournament_matches?select=*&id=eq.${id}&limit=1`);
  if(!m)throw new Error('Combate no encontrado.');
  const [t]=await rest(`tournaments?select=*&id=eq.${m.tournament_id}&limit=1`);
  if(m.status!=='resolved'||m.round_no>t.revealed_round)throw new Error('Este combate aún no se ha destapado.');
  const ents=await entriesByIds([m.entry_a,m.entry_b]);
  return {id:m.id,round:m.round_no,slot:m.slot,stage:t.stage,difficulty:t.difficulty,simVersion:m.sim_version,engineVersion:m.engine_version,roundsToWin:m.rounds_to_win||2,seed:Number(m.seed),
    a:publicEntry(ents.get(m.entry_a)),b:publicEntry(ents.get(m.entry_b)),tacticsA:normalizeCpuTactics(m.tactics_a),tacticsB:normalizeCpuTactics(m.tactics_b),
    winner:m.winner_entry===m.entry_a?'a':'b',scoreA:m.score_a,scoreB:m.score_b,decidedBy:m.decided_by,frames:m.frames};
}


/** Exportación completa de un torneo TERMINADO (mismo contenido que ya sirve matchDetail a cualquier jugador con sesión). */
async function exportTournament(tid){
  if(!uuid.test(tid))throw new Error('Torneo no válido.');
  const [t]=await rest(`tournaments?select=*&id=eq.${tid}&limit=1`);
  if(!t)throw new Error('Torneo no encontrado.');
  if(t.status!=='finished')throw new Error('El torneo aún no ha terminado.');
  const ids=[];
  for(let off=0;;off+=1000){
    const r=await rest(`tournament_matches?select=id,round_no,slot&tournament_id=eq.${tid}&order=round_no.asc,slot.asc&limit=1000&offset=${off}`);
    ids.push(...r);if(r.length<1000)break;
  }
  const rounds={},matches={};
  for(const m of ids){(rounds[m.round_no]=rounds[m.round_no]||[]).push(m.id);matches[m.id]=await matchDetail(m.id);await yieldLoop();}
  return {tournament:tid,rounds,matches};
}
/** Acceso por secreto compartido (para el workflow de vídeo), separado de las sesiones de jugador. Desactivado si no hay VIDEO_EXPORT_SECRET. */
function exportSecretOk(req){
  const want=process.env.VIDEO_EXPORT_SECRET||'';
  const got=String(req.headers['x-export-secret']||'');
  if(want.length<24||got.length!==want.length)return false;
  return require('node:crypto').timingSafeEqual(Buffer.from(got),Buffer.from(want));
}

// ---------- Acciones del jugador ----------
async function copyArt(fromPath,toPath){
  const src=await fetch(`${URL_ROOT}/storage/v1/object/fighter-private/${fromPath.split('/').map(encodeURIComponent).join('/')}`,{headers:headers(),signal:AbortSignal.timeout(20000)});
  if(!src.ok)throw new Error('No se pudo leer el arte del luchador.');
  const buf=Buffer.from(await src.arrayBuffer());
  if(buf.length>5*1024*1024)throw new Error('El arte del luchador es demasiado grande.');
  const type=(src.headers.get('content-type')||'image/png').split(';')[0];
  if(!/^image\/(png|webp|jpeg)$/.test(type))throw new Error('Formato de arte no válido.');
  const up=await fetch(`${URL_ROOT}/storage/v1/object/tournament-fighters/${toPath}`,{method:'POST',headers:headers({'Content-Type':type,'x-upsert':'true'}),body:buf,signal:AbortSignal.timeout(20000)});
  if(!up.ok)throw new Error('No se pudo congelar el arte del luchador: '+(await up.text()).slice(0,120));
}
const FAKE_ART='data:image/png;base64,AAAA';
async function join(accountId,{fighterLocalId,instagram,videoConsent}){
  if(typeof fighterLocalId!=='string'||!fighterLocalId||fighterLocalId.length>100)throw new Error('Elige un luchador.');
  const insta=typeof instagram==='string'?instagram.trim().replace(/^@/,''):'';
  if(insta&&!/^[A-Za-z0-9._]{1,30}$/.test(insta))throw new Error('Instagram no válido.');
  const [t]=await rest(`tournaments?select=*&status=eq.registration&kind=eq.real&limit=1`);
  if(!t||new Date(t.registration_closes_at)<=new Date())throw new Error('La inscripción no está abierta.');
  const params=new URLSearchParams({select:'id,fighter_name,fighter_data,private_portrait_path,private_sheet_path',owner_id:`eq.${accountId}`,local_id:`eq.${fighterLocalId}`,limit:'1'});
  const [row]=await rest(`fighters?${params}`);
  if(!row?.fighter_data)throw new Error('Este luchador aún no está sincronizado en tu cuenta. Sincronízalo y vuelve a intentarlo.');
  const valid=validateProfile({...row.fighter_data,id:fighterLocalId,fighterName:row.fighter_name,spriteSheetDataUrl:FAKE_ART,portraitDataUrl:FAKE_ART,isPreset:false,ultimateForm:false});
  if(!valid)throw new Error('El luchador no es válido para un torneo.');
  const {spriteSheetDataUrl:_s,portraitDataUrl:_p,...frozen}=valid;
  if(row.fighter_data.spriteSheetKeyVersion===3)frozen.spriteSheetKeyVersion=3;
  const folder=`${t.id}/${randomUUID()}`;
  const portrait=`${folder}/portrait.png`,sheet=`${folder}/sheet.png`;
  await copyArt(row.private_portrait_path,portrait);
  await copyArt(row.private_sheet_path,sheet);
  const [prev]=await rest(`tournament_entry_tactics?select=tactics&entry_id=in.(${(await rest(`tournament_entries?select=id&tournament_id=eq.${t.id}&account_id=eq.${accountId}`)).map(e=>e.id).join(',')||'00000000-0000-4000-8000-000000000000'})&limit=1`);
  const entryId=await rpc('pb_tournament_join',{p_tournament:t.id,p_account:accountId,p_local:fighterLocalId,p_data:frozen,p_portrait:portrait,p_sheet:sheet,
    p_name:String(row.fighter_name||valid.fighterName).slice(0,40),p_instagram:insta||'',p_consent:Boolean(insta&&videoConsent===true),
    p_tactics:normalizeCpuTactics(prev?.tactics)});
  return {entryId};
}

/** Exhibición interna (solo admin): copias congeladas de los luchadores públicos, tácticas por defecto iguales para todos. No inscribe cuentas. */
async function createExhibition(accountId,{expected,windowMinutes,label}){
  if(!(await rpc('pb_tournament_is_admin',{p_user:accountId})))throw new Error('No autorizado.');
  const rows=await rest('fighters?select=id,local_id,fighter_name,fighter_data,private_portrait_path,private_sheet_path&is_public=eq.true&order=created_at.asc&limit=100');
  if(Number.isInteger(expected)&&rows.length!==expected)throw new Error(`no válido: hay ${rows.length} luchadores públicos, no ${expected}.`);
  const w=Math.min(1440,Math.max(5,Number(windowMinutes)||15));
  const tid=await rpc('pb_tournament_create_exhibition',{p_label:String(label||'Exhibición automática').slice(0,80),p_window_minutes:w,p_stage:'SPIRIT_FOREST'});
  let added=0;
  try{
    for(const row of rows){
      const valid=validateProfile({...row.fighter_data,id:row.local_id,fighterName:row.fighter_name,spriteSheetDataUrl:FAKE_ART,portraitDataUrl:FAKE_ART,isPreset:false,ultimateForm:false});
      if(!valid)throw new Error('no válido: un luchador público no supera la validación.');
      const {spriteSheetDataUrl:_s,portraitDataUrl:_p,...frozen}=valid;
      if(row.fighter_data.spriteSheetKeyVersion===3)frozen.spriteSheetKeyVersion=3;
      const folder=`${tid}/${randomUUID()}`;
      await copyArt(row.private_portrait_path,`${folder}/portrait.png`);
      await copyArt(row.private_sheet_path,`${folder}/sheet.png`);
      await rpc('pb_tournament_add_exhibition_entry',{p_tournament:tid,p_local:row.local_id,p_data:frozen,p_portrait:`${folder}/portrait.png`,p_sheet:`${folder}/sheet.png`,
        p_name:String(row.fighter_name).slice(0,40),p_tactics:normalizeCpuTactics({})});
      added++;
    }
  }catch(e){
    await rest(`tournaments?id=eq.${tid}&status=eq.registration`,{method:'DELETE'}).catch(()=>{}); // nada a medias
    throw e;
  }
  return {tournament:tid,entrants:added,windowMinutes:w};
}

/** Solo admin: añade al torneo en inscripción copias de los luchadores públicos que aún no están (relleno automático, sin cuenta ni dueño atribuido). */
async function addPublicToOpen(accountId,{expected}={}){
  if(!(await rpc('pb_tournament_is_admin',{p_user:accountId})))throw new Error('No autorizado.');
  const [t]=await rest('tournaments?select=id,status&status=eq.registration&order=created_at.desc&limit=1');
  if(!t)throw new Error('No hay torneo en inscripción.');
  const rows=await rest('fighters?select=id,local_id,fighter_name,fighter_data,private_portrait_path,private_sheet_path&is_public=eq.true&order=created_at.asc&limit=100');
  const have=new Set((await rest(`tournament_entries?select=fighter_local_id&tournament_id=eq.${t.id}`)).map(e=>e.fighter_local_id));
  const todo=rows.filter(r=>!have.has(r.local_id));
  if(Number.isInteger(expected)&&todo.length!==expected)throw new Error(`no válido: faltan ${todo.length} luchadores públicos, no ${expected}.`);
  const prepared=[];
  for(const row of todo){
    const valid=validateProfile({...row.fighter_data,id:row.local_id,fighterName:row.fighter_name,spriteSheetDataUrl:FAKE_ART,portraitDataUrl:FAKE_ART,isPreset:false,ultimateForm:false});
    if(!valid)throw new Error('no válido: un luchador público no supera la validación.');
    prepared.push({row,valid});
  }
  let added=0;
  for(const {row,valid} of prepared){
    const {spriteSheetDataUrl:_s,portraitDataUrl:_p,...frozen}=valid;
    if(row.fighter_data.spriteSheetKeyVersion===3)frozen.spriteSheetKeyVersion=3;
    const folder=`${t.id}/${randomUUID()}`;
    await copyArt(row.private_portrait_path,`${folder}/portrait.png`);
    await copyArt(row.private_sheet_path,`${folder}/sheet.png`);
    await rpc('pb_tournament_add_exhibition_entry',{p_tournament:t.id,p_local:row.local_id,p_data:frozen,p_portrait:`${folder}/portrait.png`,p_sheet:`${folder}/sheet.png`,
      p_name:String(row.fighter_name).slice(0,40),p_tactics:normalizeCpuTactics({})});
    added++;
  }
  return {tournament:t.id,added,alreadyIn:rows.length-todo.length,publicTotal:rows.length};
}
async function saveTactics(accountId,tactics){
  if(!tactics||typeof tactics!=='object'||Array.isArray(tactics))throw new Error('Tácticas no válidas.');
  const clean=normalizeCpuTactics(tactics);
  const [t]=await rest(`tournaments?select=id&status=${LIVE}&limit=1`);
  if(!t)throw new Error('No hay torneo en marcha.');
  const [me]=await rest(`tournament_entries?select=id&tournament_id=eq.${t.id}&account_id=eq.${accountId}&limit=1`);
  if(!me)throw new Error('No estás inscrito.');
  let ok;
  try{ok=await rpc('pb_tournament_save_tactics',{p_entry:me.id,p_account:accountId,p_tactics:clean});}
  catch(e){if(/demasiado/.test(String(e.message)))throw new Error('Demasiado rápido. Espera un segundo.');throw e;}
  if(!ok)throw new Error('Ya no puedes editar las tácticas (estás eliminado).');
  return {tactics:clean};
}

// ---------- Directo del propio combate ----------
/** El directo arranca LIVE_LEAD_MS después de que el servidor dejara resuelto el combate (resolved_at): es un ancla común a los dos
 *  contendientes que no depende de cuánto tarde la simulación. Dura lo que dura de verdad el combate (frames/60). */
const LIVE_LEAD_MS=Number(process.env.TOURNAMENT_LIVE_LEAD_MS||30000);
const LIVE_GRACE_MS=15000;
/** (Ya NO lleva tácticas: el cliente reproduce la traza de /tournament/live/trace.) Solo para un inscrito, solo SU combate resuelto más reciente, y solo mientras dura su ventana de emisión. Nunca devuelve ganador, marcador
 *  ni motivo de final. Las tácticas de ambos viajan porque el motor las necesita para recrear el combate; la interfaz no muestra las del rival. */
/** APAGADO por defecto: mientras las tácticas del rival viajen en la respuesta, no se entrega nada. Solo se enciende con TOURNAMENT_LIVE=1
 *  (pruebas); en producción no se define, así que siempre devuelve live:null. */
const LIVE_ENABLED=()=>process.env.TOURNAMENT_LIVE==='1';
async function liveFor(accountId){
  const out={now:new Date().toISOString(),live:null};
  if(!LIVE_ENABLED())return out;
  const cand=[];
  const [live]=await rest(`tournaments?select=*&status=${LIVE}&limit=1`);
  const [last]=await rest('tournaments?select=*&status=eq.finished&order=finished_at.desc&limit=1');
  if(live)cand.push(live);
  if(last)cand.push(last);
  for(const t of cand){
    const [me]=await rest(`tournament_entries?select=id&tournament_id=eq.${t.id}&account_id=eq.${accountId}&limit=1`);
    if(!me)continue;
    const [m]=await rest(`tournament_matches?select=*&tournament_id=eq.${t.id}&status=eq.resolved&or=(entry_a.eq.${me.id},entry_b.eq.${me.id})&order=round_no.desc&limit=1`);
    if(!m||!m.resolved_at||!m.entry_a||!m.entry_b||!(m.frames>0))continue;
    const anchor=new Date(m.resolved_at).getTime()+LIVE_LEAD_MS;
    const endsAt=anchor+Math.ceil(m.frames*1000/60);
    if(Date.now()>endsAt+LIVE_GRACE_MS)continue;
    const ents=await entriesByIds([m.entry_a,m.entry_b]);
    out.live={matchId:m.id,round:m.round_no,tournamentId:t.id,youAre:m.entry_a===me.id?'a':'b',anchorMs:anchor,endsAtMs:endsAt,frames:m.frames,
      stage:t.stage,difficulty:t.difficulty,simVersion:m.sim_version,engineVersion:m.engine_version,roundsToWin:m.rounds_to_win||2,
      a:publicEntry(ents.get(m.entry_a)),b:publicEntry(ents.get(m.entry_b)),hasTrace:true};
    break;
  }
  return out;
}

const traceCache=new Map();
/** Traza de reproducción de SU combate en directo (gzip). Misma autorización que liveFor (solo un participante, solo su combate vigente);
 *  las tácticas se leen aquí, en el servidor, y no salen. Se cachea en memoria para que los dos contendientes reciban los mismos bytes. */
async function liveTraceFor(accountId,matchId){
  if(!uuid.test(matchId||''))return null;
  const info=await liveFor(accountId);
  if(!info.live||info.live.matchId!==matchId)return null;
  const [m]=await rest(`tournament_matches?select=*&id=eq.${matchId}&limit=1`);
  if(!m)return null;
  const cached=traceCache.get(matchId);
  // La caché solo vale si el combate oficial guardado sigue siendo el mismo que se validó.
  if(cached&&cached.frames===m.frames&&cached.sa===m.score_a&&cached.sb===m.score_b&&cached.w===m.winner_entry)return cached.body;
  const ents=await entriesByIds([m.entry_a,m.entry_b]);
  const a=ents.get(m.entry_a),b=ents.get(m.entry_b);
  const pa={...a.fighter_data,id:'a',spriteSheetDataUrl:'',portraitDataUrl:''},pb={...b.fighter_data,id:'b',spriteSheetDataUrl:'',portraitDataUrl:''};
  const {tournamentId}=info.live;
  const [t]=await rest(`tournaments?select=*&id=eq.${tournamentId}&limit=1`);
  const rec=require('./trace.cjs').record(m.engine_version,pa,pb,m.tactics_a,m.tactics_b,t.stage,t.difficulty,{roundsToWin:m.rounds_to_win||2});
  // Falla cerrado: si lo que se emitiría no dura lo mismo que el combate oficial guardado, no se emite nada.
  if(rec.frames!==m.frames)return null;
  // Y también si el marcador o el ganador de la traza discrepan del oficial guardado (aunque duren lo mismo).
  let last={};for(const d of rec.states)last={...last,...d};
  const sn=last.snapshot||{};
  if(sn.p1RoundWins!==m.score_a||sn.p2RoundWins!==m.score_b)return null;
  if(m.score_a!==m.score_b&&m.winner_entry!==(m.score_a>m.score_b?m.entry_a:m.entry_b))return null;
  const body=require('./trace.cjs').encode(rec);
  traceCache.set(matchId,{body,frames:m.frames,sa:m.score_a,sb:m.score_b,w:m.winner_entry});
  if(traceCache.size>20)traceCache.delete(traceCache.keys().next().value);
  return body;
}

// ---------- Programador ----------
let ticking=false,lastRun=0,lastResult={ok:true,idle:true};
const MIN_GAP_MS=Number(process.env.TOURNAMENT_MIN_GAP_MS||5000);
/** e1: siempre al mejor de 3 (torneos antiguos, inmutables). e2: todas las rondas a un solo round (BO1), sin excepciones. */
function roundsToWinFor(t,roundNo){return t.engine_version==='e1'?2:1;}
const yieldLoop=()=>new Promise(r=>setImmediate(r));
async function simulateBatch(t,matches){
  const ents=await entriesByIds([...new Set(matches.flatMap(m=>[m.entry_a,m.entry_b]))]);
  const rows=[];
  for(const m of matches){
    const a=ents.get(m.entry_a),b=ents.get(m.entry_b);
    const pa={...a.fighter_data,id:'a',spriteSheetDataUrl:'',portraitDataUrl:''},pb={...b.fighter_data,id:'b',spriteSheetDataUrl:'',portraitDataUrl:''};
    const rtw=roundsToWinFor(t,m.round_no);
    const r=sim.simulate(t.engine_version,pa,pb,m.tactics_a,m.tactics_b,t.stage,t.difficulty,{roundsToWin:rtw});
    rows.push({id:m.id,w:r.winner,sa:r.scoreA,sb:r.scoreB,f:r.frames,d:r.decidedBy,seed:r.seed,sv:t.sim_version,ev:t.engine_version,rtw:r.roundsToWin});
    await yieldLoop(); // no bloquear las salas online
  }
  await rpc('pb_tournament_store_results',{p_tid:t.id,p_rows:rows});
  return rows.length;
}
async function work(){
  const started=Date.now();const log=[];
  const actions=await rpc('pb_tournament_next_action',{});
  for(const a of actions||[]){
    if(!a.action)continue;
    if(a.action==='close'){log.push('close:'+await rpc('pb_tournament_close_registration',{p_id:a.id}));continue;}
    if(a.action==='cut'){const ok=await rpc('pb_tournament_cut_round',{p_id:a.id});log.push('cut:'+ok);if(!ok)continue;}
    // simulate
    if(!(await rpc('pb_tournament_claim',{p_id:a.id,p_seconds:LOCK_SECONDS}))){log.push('busy');continue;}
    let simulated=0;
    try{
      for(;;){
        const [t]=await rest(`tournaments?select=*&id=eq.${a.id}&limit=1`);
        if(!t||t.status!=='simulating')break;
        const pending=await rest(`tournament_matches?select=id,entry_a,entry_b,tactics_a,tactics_b&tournament_id=eq.${a.id}&round_no=eq.${t.round_no}&status=eq.pending&order=slot.asc&limit=${BATCH}`);
        if(!pending.length){log.push('finish:'+await rpc('pb_tournament_finish_round',{p_id:a.id}));break;}
        simulated+=await simulateBatch(t,pending);
        await rpc('pb_tournament_claim',{p_id:a.id,p_seconds:0}); // soltar y volver a tomar = renovar
        if(Date.now()-started>TICK_BUDGET_MS){log.push('budget');break;}
        if(!(await rpc('pb_tournament_claim',{p_id:a.id,p_seconds:LOCK_SECONDS}))){log.push('lost-lock');break;}
      }
    }finally{
      try{await rpc('pb_tournament_claim',{p_id:a.id,p_seconds:0});}catch{}
    }
    log.push('simulated:'+simulated);
  }
  return {ok:true,actions:log,ms:Date.now()-started};
}
/** Una llamada hace como mucho una pasada; si ya hay una en curso o hubo otra hace <5 s, devuelve el último resultado sin trabajar. */
async function tick({internal=false}={}){
  if(!configured)return {ok:false,reason:'not-configured'};
  if(ticking)return {ok:true,busy:true};
  if(!internal&&Date.now()-lastRun<MIN_GAP_MS)return {ok:true,throttled:true};
  ticking=true;lastRun=Date.now();
  try{lastResult=await work();}
  catch(e){lastResult={ok:false,error:String(e.message||e).slice(0,160)};console.error('[tournament] tick',e);}
  finally{ticking=false;lastRun=Date.now();}
  return lastResult;
}
let timer=null;
function startTimer(){
  if(!configured||timer)return;
  timer=setInterval(()=>{void tick({internal:true});},30000);timer.unref?.();
  setTimeout(()=>void tick({internal:true}),5000).unref?.();
}

// ---------- HTTP ----------
const buckets=new Map();
function limited(key,max,perMs){
  const now=Date.now();let b=buckets.get(key);
  if(!b||now>b.reset){b={n:0,reset:now+perMs};buckets.set(key,b);if(buckets.size>5000)for(const [k,v] of buckets)if(now>v.reset)buckets.delete(k);}
  return ++b.n>max;
}
function readBody(req,max=16384){
  return new Promise((resolve,reject)=>{let size=0;const chunks=[];
    req.on('data',c=>{size+=c.length;if(size>max){reject(new Error('Cuerpo demasiado grande.'));req.destroy();return;}chunks.push(c);});
    req.on('end',()=>{try{resolve(chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{});}catch{reject(new Error('JSON no válido.'));}});
    req.on('error',reject);});
}
/** Devuelve true si la URL era de torneos (y la ha respondido). */
async function handleHttp(req,res,{corsOrigin}){
  const url=new URL(req.url,'http://x');
  if(!url.pathname.startsWith('/tournament/'))return false;
  const cors={...(corsOrigin?{'Access-Control-Allow-Origin':corsOrigin,Vary:'Origin'}:{}),'Cache-Control':'no-store'};
  const send=(code,obj)=>{res.writeHead(code,{'Content-Type':'application/json',...cors});res.end(JSON.stringify(obj));};
  if(req.method==='OPTIONS'){res.writeHead(204,{...cors,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Max-Age':'600'});res.end();return true;}
  const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'?').split(',')[0].trim();
  try{
    if(url.pathname==='/tournament/tick'){
      // Público a propósito (lo llama el programador de Supabase), pero seguro: no recibe datos, solo hace lo que la hora de la BD marca
      // como pendiente, una pasada a la vez y con límite por IP.
      if(limited('tick:'+ip,Number(process.env.TOURNAMENT_TICK_LIMIT||20),60000))return send(429,{ok:false,error:'Demasiadas llamadas.'}),true;
      const r=await tick();return send(200,r),true;
    }
    const vctx={URL_ROOT,rest,headers,uuid,limited,readBody,ip,configured:()=>configured&&rankedApi.available()};
    if(await video.handleSecret(req,res,url,vctx,send))return true;
    if(url.pathname==='/tournament/export'&&req.method==='GET'){
      if(!process.env.VIDEO_EXPORT_SECRET)return send(404,{error:'No encontrado.'}),true;
      if(limited('export:'+ip,Number(process.env.TOURNAMENT_EXPORT_LIMIT||10),60000))return send(429,{error:'Demasiadas peticiones.'}),true;
      if(!exportSecretOk(req))return send(401,{error:'No autorizado.'}),true;
      if(!configured||!rankedApi.available())return send(503,{error:'Torneos no configurados en el servidor.'}),true;
      return send(200,await exportTournament(url.searchParams.get('tournament')||'')),true;
    }
    if(limited('api:'+ip,Number(process.env.TOURNAMENT_API_LIMIT||300),60000))return send(429,{error:'Demasiadas peticiones.'}),true;
    if(!configured||!rankedApi.available())return send(503,{error:'Torneos no configurados en el servidor.'}),true;
    const auth=String(req.headers.authorization||'');
    const accountId=await rankedApi.verifyUser(auth.startsWith('Bearer ')?auth.slice(7):'');
    if(limited('acct:'+accountId,60,60000))return send(429,{error:'Demasiadas peticiones.'}),true;
    if(await video.handleUser(req,res,url,vctx,send,accountId,auth.startsWith('Bearer ')?auth.slice(7):''))return true;
    if(url.pathname==='/tournament/state'&&req.method==='GET'){
      void tick(); // red de seguridad: si el programador falló, una visita también avanza lo vencido (con los mismos límites)
      return send(200,await stateFor(accountId)),true;
    }
    if(url.pathname==='/tournament/join'&&req.method==='POST')return send(200,await join(accountId,await readBody(req))),true;
    if(url.pathname==='/tournament/exhibition'&&req.method==='POST'){
      if(limited('exh:'+accountId,3,60000))throw new Error('Demasiado rápido. Espera un segundo.');
      return send(200,await createExhibition(accountId,await readBody(req))),true;
    }
    if(url.pathname==='/tournament/add-public'&&req.method==='POST'){
      if(limited('pub:'+accountId,3,60000))throw new Error('Demasiado rápido. Espera un segundo.');
      return send(200,await addPublicToOpen(accountId,await readBody(req))),true;
    }
    if(url.pathname==='/tournament/tactics'&&req.method==='POST')return send(200,await saveTactics(accountId,(await readBody(req)).tactics)),true;
    if(url.pathname==='/tournament/live'&&req.method==='GET')return send(200,await liveFor(accountId)),true;
    if(url.pathname==='/tournament/live/trace'&&req.method==='GET'){
      const body=await liveTraceFor(accountId,url.searchParams.get('id')||'');
      if(!body){res.writeHead(404,{'Content-Type':'application/json',...cors});res.end('{"error":"Sin directo."}');return true;}
      res.writeHead(200,{'Content-Type':'application/json','Content-Encoding':'gzip',...cors});res.end(body);return true;
    }
    if(url.pathname==='/tournament/match'&&req.method==='GET')return send(200,await matchDetail(url.searchParams.get('id')||'')),true;
    if(url.pathname==='/tournament/bracket'&&req.method==='GET'){
      const tid=url.searchParams.get('tournament')||'';if(!uuid.test(tid))throw new Error('Torneo no válido.');
      return send(200,await bracket(tid,Number(url.searchParams.get('round'))|0,Number(url.searchParams.get('offset'))|0)),true;
    }
    send(404,{error:'No encontrado.'});
  }catch(e){
    const msg=String(e.message||e);
    const client=/Inicia sesión|sesión ha caducado|No se pudo verificar la cuenta|no está abierta|aún no|No estás|Ya no puedes|Demasiado|no válid|no es válido|Elige|No autorizado|no encontrado|No hay torneo|sincronizado|inscripción|cuerpo|JSON|demasiado|El día debe/i.test(msg);
    console.warn('[tournament]',url.pathname,msg.slice(0,200));
    send(client?400:500,{error:client?msg:'Error interno del servidor.'});
  }
  return true;
}
module.exports={createExhibition,addPublicToOpen,configured:()=>configured,handleHttp,exportTournament,exportSecretOk,tick,startTimer,stateFor,liveFor,liveTraceFor,matchDetail,bracket,join,saveTactics};
