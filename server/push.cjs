'use strict';
/** V58 · Avisos Web Push para acciones sociales directas (solicitudes de amistad
 * e invitaciones a combate). El texto de la notificación se construye SIEMPRE
 * aquí a partir de filas de Supabase; el cliente solo envía {kind, ...ids}.
 * La clave privada VAPID vive únicamente en variables de entorno de Render. */
const webpush=require('web-push');
const rankedApi=require('./ranked.cjs');

const URL_ROOT=(process.env.SUPABASE_URL||'').trim().replace(/\/+$/,'');
const SECRET_KEY=(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
const VAPID_PUBLIC=(process.env.VAPID_PUBLIC_KEY||'').trim();
const VAPID_PRIVATE=(process.env.VAPID_PRIVATE_KEY||'').trim();
const VAPID_SUBJECT=(process.env.VAPID_SUBJECT||'').trim();
const configured=Boolean(/^https:\/\/[^/]+/.test(URL_ROOT)&&SECRET_KEY&&VAPID_PUBLIC&&VAPID_PRIVATE&&/^mailto:|^https:\/\//.test(VAPID_SUBJECT));
if(configured)webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC,VAPID_PRIVATE);

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{12}$/i;
const MAX_BODY=64*1024;
const MAX_SUBS_PER_USER=10;
const NOTIFY_WINDOW_MS=10*60_000;
const NOTIFY_LIMIT=30;
const notifyLog=new Map(); // userId -> timestamps (proceso; el límite duro de spam sigue en SQL)
function rateLimited(userId){
  const now=Date.now();
  const list=(notifyLog.get(userId)||[]).filter(t=>now-t<NOTIFY_WINDOW_MS);
  if(list.length>=NOTIFY_LIMIT){notifyLog.set(userId,list);return true;}
  list.push(now);notifyLog.set(userId,list);return false;
}
function serviceHeaders(extra={}){
  const headers={apikey:SECRET_KEY,'Content-Type':'application/json',...extra};
  // Los JWT service_role antiguos necesitan Authorization; las claves sb_secret modernas no.
  if(!SECRET_KEY.startsWith('sb_secret_'))headers.Authorization=`Bearer ${SECRET_KEY}`;
  return headers;
}
async function serviceFetch(path,init={}){
  const response=await fetch(`${URL_ROOT}/rest/v1${path}`,{...init,headers:serviceHeaders(init?.headers),signal:AbortSignal.timeout(9000)});
  return response;
}
async function serviceRows(path){
  const response=await serviceFetch(path);
  if(!response.ok)throw new Error(`Supabase respondió ${response.status}.`);
  const rows=await response.json();
  return Array.isArray(rows)?rows:[];
}
async function profileName(userId){
  const rows=await serviceRows(`/player_profiles?select=username,display_name&id=eq.${encodeURIComponent(userId)}&limit=1`);
  const row=rows[0];
  if(!row)return 'Un jugador';
  const name=(row.display_name||'').trim()||`@${(row.username||'jugador').trim()}`;
  return name.slice(0,40);
}
async function saveSubscription(userId,subscription){
  const endpoint=typeof subscription?.endpoint==='string'?subscription.endpoint:'';
  const p256dh=typeof subscription?.keys?.p256dh==='string'?subscription.keys.p256dh:'';
  const auth=typeof subscription?.keys?.auth==='string'?subscription.keys.auth:'';
  if(!/^https:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]{10,2000}$/.test(endpoint))
    throw new Error('El endpoint de la suscripción no es válido.');
  if(p256dh.length<20||p256dh.length>200||auth.length<10||auth.length>100||
     !/^[A-Za-z0-9_-]+$/.test(p256dh)||!/^[A-Za-z0-9_-]+$/.test(auth))
    throw new Error('Las claves de la suscripción no son válidas.');
  const body={endpoint,user_id:userId,p256dh,auth,updated_at:new Date().toISOString()};
  const response=await serviceFetch('/pb_push_subscriptions?on_conflict=endpoint',{
    method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body),
  });
  if(!response.ok)throw new Error(`No se pudo guardar la suscripción (${response.status}).`);
  // Conserva como máximo los MAX_SUBS_PER_USER dispositivos más recientes de la cuenta.
  const mine=await serviceRows(`/pb_push_subscriptions?select=endpoint,updated_at&user_id=eq.${userId}&order=updated_at.desc`);
  for(const stale of mine.slice(MAX_SUBS_PER_USER)){
    await serviceFetch(`/pb_push_subscriptions?endpoint=eq.${encodeURIComponent(stale.endpoint)}&user_id=eq.${userId}`,{method:'DELETE'}).catch(()=>{});
  }
}
async function removeSubscription(userId,endpoint){
  if(typeof endpoint!=='string'||endpoint.length<10||endpoint.length>2048)throw new Error('Endpoint no válido.');
  const response=await serviceFetch(`/pb_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&user_id=eq.${userId}`,{method:'DELETE'});
  if(!response.ok)throw new Error(`No se pudo eliminar la suscripción (${response.status}).`);
}
/** Resuelve el destinatario y el texto según la fila REAL de Supabase. Nunca confía en el cuerpo del cliente. */
async function resolveNotification(userId,kind,body){
  if(kind==='friend_request'){
    const username=typeof body?.username==='string'?body.username.trim().toLowerCase():'';
    if(!/^[a-z0-9_.-]{1,24}$/.test(username))throw new Error('Solicitud de aviso no válida.');
    const others=await serviceRows(`/player_profiles?select=id,username&username=eq.${encodeURIComponent(username)}&limit=1`);
    const other=others[0];
    if(!other||other.id===userId)throw new Error('Ese usuario no existe.');
    const a=userId<other.id?userId:other.id,b=userId<other.id?other.id:userId;
    const rows=await serviceRows(`/pb_friendships?select=requested_by,status&user_a=eq.${a}&user_b=eq.${b}&limit=1`);
    const friendship=rows[0];
    if(!friendship||friendship.status!=='pending'||friendship.requested_by!==userId)
      throw new Error('No hay una solicitud de amistad pendiente tuya para ese usuario.');
    return {recipient:other.id,tag:`friend-${a}-${b}`,ttl:3*24*3600,
      text:`${await profileName(userId)} quiere ser tu amigo en PHOTO BRAWL`};
  }
  if(kind==='game_invitation'||kind==='invitation_accepted'){
    const id=typeof body?.invitation==='string'?body.invitation:'';
    if(!uuid.test(id))throw new Error('Invitación no válida.');
    const rows=await serviceRows(`/pb_game_invitations?select=inviter_id,invitee_id,battle_mode,ranked,status,expires_at&id=eq.${id}&limit=1`);
    const invite=rows[0];
    if(!invite)throw new Error('Invitación no encontrada.');
    const mode=invite.battle_mode==='2V2'?'2 VS 2':invite.battle_mode==='FREE_FOR_ALL'?'TODOS CONTRA TODOS':'1 VS 1';
    const rankedLabel=invite.ranked?' · RANKED':'';
    if(kind==='game_invitation'){
      if(invite.inviter_id!==userId)throw new Error('Solo quien invita puede avisar de su invitación.');
      if(invite.status!=='pending'||Date.parse(invite.expires_at)<=Date.now())
        throw new Error('La invitación ya no está pendiente.');
      return {recipient:invite.invitee_id,tag:`invite-${id}`,ttl:600,
        text:`${await profileName(userId)} te invita a un combate ${mode}${rankedLabel}`};
    }
    if(invite.invitee_id!==userId)throw new Error('Solo el invitado puede avisar de que se une.');
    if(invite.status!=='accepted')throw new Error('La invitación no está aceptada.');
    return {recipient:invite.inviter_id,tag:`join-${id}`,ttl:900,
      text:`${await profileName(userId)} se une a tu sala de ${mode}${rankedLabel}`};
  }
  throw new Error('Tipo de aviso no admitido.');
}
async function sendToUser(userId,payload,ttl){
  const subs=await serviceRows(`/pb_push_subscriptions?select=endpoint,p256dh,auth&user_id=eq.${userId}`);
  let sent=0;
  for(const sub of subs){
    try{
      await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},
        JSON.stringify(payload),{TTL:ttl,urgency:'high'});
      sent++;
    }catch(error){
      const status=error?.statusCode||0;
      if(status===404||status===410){
        await serviceFetch(`/pb_push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,{method:'DELETE'}).catch(()=>{});
      }else{
        console.warn('[push] fallo al enviar',status||error?.message);
      }
    }
  }
  return sent;
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let size=0;const chunks=[];
    req.on('data',chunk=>{
      size+=chunk.length;
      if(size>MAX_BODY){reject(new Error('Cuerpo demasiado grande.'));req.destroy();return;}
      chunks.push(chunk);
    });
    req.on('end',()=>{
      if(!chunks.length)return resolve({});
      try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}
      catch{reject(new Error('JSON no válido.'));}
    });
    req.on('error',()=>reject(new Error('No se pudo leer la petición.')));
  });
}
function reply(res,status,payload){
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify(payload));
}
/** Atiende /push/*. Devuelve true si la ruta era de push. */
async function handle(req,res){
  const url=new URL(req.url,'http://localhost');
  const path=url.pathname;
  if(path==='/push/vapid-public-key'&&req.method==='GET'){
    reply(res,200,{configured,key:configured?VAPID_PUBLIC:null});return true;
  }
  if(!path.startsWith('/push/'))return false;
  if(!configured){reply(res,503,{error:'Los avisos push aún no están configurados en el servidor.'});return true;}
  try{
    if(req.method==='POST'&&path==='/push/subscriptions'){
      const body=await readBody(req);
      const userId=await rankedApi.verifyUser(body?.accessToken);
      await saveSubscription(userId,body?.subscription);
      reply(res,200,{ok:true});return true;
    }
    if(req.method==='POST'&&path==='/push/subscriptions/delete'){
      const body=await readBody(req);
      const userId=await rankedApi.verifyUser(body?.accessToken);
      await removeSubscription(userId,body?.endpoint);
      reply(res,200,{ok:true});return true;
    }
    if(req.method==='POST'&&path==='/push/notify'){
      const body=await readBody(req);
      const userId=await rankedApi.verifyUser(body?.accessToken);
      if(rateLimited(userId)){reply(res,429,{error:'Demasiados avisos. Prueba más tarde.'});return true;}
      const kind=typeof body?.kind==='string'?body.kind:'';
      const note=await resolveNotification(userId,kind,body);
      const sent=await sendToUser(note.recipient,{title:'PHOTO BRAWL',body:note.text,tag:note.tag,url:'./'},note.ttl);
      reply(res,200,{ok:true,sent});return true;
    }
    reply(res,404,{error:'Not Found'});return true;
  }catch(error){
    const message=error instanceof Error?error.message:'Error interno.';
    reply(res,message.startsWith('Las clasificatorias')||message.includes('sesión')?401:400,{error:message});
    return true;
  }
}
module.exports={handle,configured:()=>configured};
