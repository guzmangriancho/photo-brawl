'use strict';
/** Vídeo de torneo bajo demanda: el admin lo pide desde la app, un workflow de GitHub lo genera y lo sube aquí,
 * y el servidor lo entrega con URL firmada de un bucket PRIVADO. Ningún secreto de Supabase sale de este servidor:
 * GitHub solo conoce VIDEO_EXPORT_SECRET, que solo vale para exportar torneos terminados y subir el mp4 de una petición abierta.
 * Todo queda desactivado (404) mientras no existan VIDEO_EXPORT_SECRET y GITHUB_DISPATCH_TOKEN. */
const {timingSafeEqual}=require('node:crypto');

const BUCKET='tournament-videos';
const MAX_BYTES=20*1024*1024;            // igual que el límite del bucket
const STALE_MS=45*60*1000;               // una petición sin mp4 tras 45 min se muestra como fallida
const SIGN_SECONDS=300;
const cfg=()=>({
  secret:process.env.VIDEO_EXPORT_SECRET||'',
  ghToken:process.env.GITHUB_DISPATCH_TOKEN||'',
  repo:(process.env.VIDEO_GITHUB_REPO||'guzmangriancho/photo-brawl').trim(),
  workflow:(process.env.VIDEO_WORKFLOW_FILE||'tournament-video.yml').trim(),
  ref:(process.env.VIDEO_WORKFLOW_REF||'main').trim(),
  api:(process.env.GITHUB_API_BASE||'https://api.github.com').replace(/\/+$/,''),
  pub:(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'').trim(),
});
const enabled=()=>{const c=cfg();return c.secret.length>=24&&Boolean(c.ghToken);};
function secretOk(req){
  const want=cfg().secret,got=String(req.headers['x-export-secret']||'');
  if(want.length<24||got.length!==want.length)return false;
  return timingSafeEqual(Buffer.from(got),Buffer.from(want));
}
function readRaw(req,max){
  return new Promise((resolve,reject)=>{let size=0;const chunks=[];
    req.on('data',c=>{size+=c.length;if(size>max){reject(new Error('Archivo demasiado grande.'));req.destroy();return;}chunks.push(c);});
    req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject);});
}
/** Solo el propietario de la app (la misma función pb_is_admin que ya usa la galería de administración). VIDEO_ALLOW=participants no existe a propósito. */
async function isAdmin(ctx,accessToken){
  const c=cfg();if(!c.pub||!accessToken)return false;
  const r=await fetch(`${ctx.URL_ROOT}/rest/v1/rpc/pb_is_admin`,{method:'POST',headers:{apikey:c.pub,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000)});
  if(!r.ok)return false;
  return (await r.json().catch(()=>false))===true;
}
const getRow=async(ctx,tid)=>(await ctx.rest(`tournament_videos?select=*&tournament_id=eq.${tid}&limit=1`))[0]||null;
const finished=async(ctx,tid)=>{const [t]=await ctx.rest(`tournaments?select=id,status&id=eq.${tid}&limit=1`);return Boolean(t&&t.status==='finished');};
async function signedUrl(ctx,tid){
  const r=await fetch(`${ctx.URL_ROOT}/storage/v1/object/sign/${BUCKET}/${tid}.mp4`,{method:'POST',headers:ctx.headers({'Content-Type':'application/json'}),body:JSON.stringify({expiresIn:SIGN_SECONDS}),signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('No se pudo preparar la descarga.');
  const {signedURL}=await r.json();
  if(typeof signedURL!=='string'||!signedURL.startsWith('/object/sign/'+BUCKET+'/'))throw new Error('No se pudo preparar la descarga.');
  return `${ctx.URL_ROOT}/storage/v1${signedURL}`;
}
function viewOf(row){
  if(!row)return {status:'none'};
  let status=row.status;
  if(status==='queued'&&Date.now()-Date.parse(row.requested_at)>STALE_MS)status='failed';
  return {status,dayNo:row.day_no,requestedAt:row.requested_at};
}
async function dispatch(tid,dayNo){
  const c=cfg();
  const r=await fetch(`${c.api}/repos/${c.repo}/actions/workflows/${encodeURIComponent(c.workflow)}/dispatches`,{method:'POST',
    headers:{Authorization:'Bearer '+c.ghToken,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'photo-brawl-server','Content-Type':'application/json'},
    body:JSON.stringify({ref:c.ref,inputs:{tournament_id:tid,day:String(dayNo)}}),signal:AbortSignal.timeout(15000)});
  if(!(r.status===200||r.status===204)){console.warn('[video] dispatch',r.status);throw new Error('No se pudo lanzar la generación del vídeo.');}
}

/** Rutas con secreto compartido (las llama el workflow). Devuelve true si respondió. */
async function handleSecret(req,res,url,ctx,send){
  const p=url.pathname;
  if(p!=='/tournament/video-upload'&&p!=='/tournament/video-failed')return false;
  if(!enabled())return send(404,{error:'No encontrado.'}),true;
  if(ctx.limited('vsec:'+ctx.ip,30,60000))return send(429,{error:'Demasiadas peticiones.'}),true;
  if(!secretOk(req))return send(401,{error:'No autorizado.'}),true;
  if(!ctx.configured())return send(503,{error:'Torneos no configurados en el servidor.'}),true;
  const tid=url.searchParams.get('tournament')||'';
  if(!ctx.uuid.test(tid))return send(400,{error:'Torneo no válido.'}),true;
  const row=await getRow(ctx,tid);
  if(!row||row.status!=='queued')return send(409,{error:'No hay una petición abierta para este torneo.'}),true;
  if(p==='/tournament/video-failed'&&req.method==='POST'){
    await ctx.rest(`tournament_videos?tournament_id=eq.${tid}`,{method:'PATCH',body:{status:'failed',updated_at:new Date().toISOString()}});
    return send(200,{ok:true}),true;
  }
  if(p==='/tournament/video-upload'&&req.method==='PUT'){
    const buf=await readRaw(req,MAX_BYTES);
    if(buf.length<1024||buf.subarray(4,8).toString('latin1')!=='ftyp')return send(400,{error:'El archivo no es un mp4.'}),true;
    const up=await fetch(`${ctx.URL_ROOT}/storage/v1/object/${BUCKET}/${tid}.mp4`,{method:'POST',headers:ctx.headers({'Content-Type':'video/mp4','x-upsert':'true'}),body:buf,signal:AbortSignal.timeout(60000)});
    if(!up.ok){console.warn('[video] storage',up.status);return send(502,{error:'No se pudo guardar el vídeo.'}),true;}
    await ctx.rest(`tournament_videos?tournament_id=eq.${tid}`,{method:'PATCH',body:{status:'ready',updated_at:new Date().toISOString()}});
    return send(200,{ok:true,bytes:buf.length}),true;
  }
  return send(405,{error:'Método no permitido.'}),true;
}

/** Rutas de usuario (ya verificado: accountId + accessToken). */
async function handleUser(req,res,url,ctx,send,accountId,accessToken){
  if(url.pathname!=='/tournament/video')return false;
  if(!enabled())return send(200,{enabled:false}),true;
  if(!(await isAdmin(ctx,accessToken)))return send(200,{enabled:false}),true;
  if(req.method==='GET'){
    const tid=url.searchParams.get('tournament')||'';
    if(!ctx.uuid.test(tid))throw new Error('Torneo no válido.');
    const v=viewOf(await getRow(ctx,tid));
    if(v.status==='ready')v.url=await signedUrl(ctx,tid);
    return send(200,{enabled:true,...v}),true;
  }
  if(req.method==='POST'){
    const body=await ctx.readBody(req);
    const tid=String(body.tournament||'');
    if(!ctx.uuid.test(tid))throw new Error('Torneo no válido.');
    const dayNo=Number(body.day);
    if(!Number.isInteger(dayNo)||dayNo<1||dayNo>999)throw new Error('El día debe ser un número entre 1 y 999.');
    if(!(await finished(ctx,tid)))throw new Error('El torneo aún no ha terminado.');
    const cur=viewOf(await getRow(ctx,tid));
    if(cur.status==='queued')return send(409,{error:'El vídeo ya se está generando.'}),true;
    if(cur.status==='ready'&&body.force!==true)return send(409,{error:'Este torneo ya tiene vídeo.'}),true;
    if(ctx.limited('vreq:'+accountId,5,600000))return send(429,{error:'Demasiadas peticiones.'}),true; // solo cuentan los lanzamientos reales
    const now=new Date().toISOString();
    await ctx.rest('tournament_videos?on_conflict=tournament_id',{method:'POST',prefer:'resolution=merge-duplicates',body:{tournament_id:tid,day_no:dayNo,status:'queued',requested_by:accountId,requested_at:now,updated_at:now}});
    try{await dispatch(tid,dayNo);}
    catch(e){
      await ctx.rest(`tournament_videos?tournament_id=eq.${tid}`,{method:'PATCH',body:{status:'failed',updated_at:new Date().toISOString()}});
      return send(502,{error:e.message}),true;
    }
    return send(200,{enabled:true,status:'queued',dayNo,requestedAt:now}),true;
  }
  return send(405,{error:'Método no permitido.'}),true;
}
module.exports={handleSecret,handleUser,enabled,secretOk,viewOf,BUCKET,MAX_BYTES,STALE_MS};
