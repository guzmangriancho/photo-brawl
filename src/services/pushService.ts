/** V58 · Avisos push opt-in. El servidor Render verifica la sesión y construye el texto;
 * el navegador solo guarda la suscripción y pide avisos de acciones REALES ya creadas. */
import {getOnlineAccessToken} from './supabaseClient';

export type PushSupport='unsupported'|'unconfigured'|'denied'|'available'|'enabled';
export type PushKind='friend_request'|'game_invitation'|'invitation_accepted';

/** El backend HTTP es el mismo host que el WebSocket online (wss://…/ws → https://…). */
function serverBase():string{
  const raw=(import.meta.env.VITE_ONLINE_WS_URL as string|undefined)?.trim()||'';
  if(!/^wss?:\/\//i.test(raw))return '';
  return raw.replace(/^wss:\/\//i,'https://').replace(/^ws:\/\//i,'http://').replace(/\/ws\/?$/i,'');
}
function urlB64ToUint8Array(base64:string):Uint8Array{
  const padding='='.repeat((4-base64.length%4)%4);
  const normal=(base64+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(normal);
  const output=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)output[i]=raw.charCodeAt(i);
  return output;
}
async function api(path:string,body?:unknown):Promise<Response>{
  const base=serverBase();
  if(!base)throw new Error('El servidor online no está configurado.');
  return fetch(`${base}${path}`,body===undefined?{method:'GET'}:{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
  });
}
export async function pushSupported():Promise<boolean>{
  return Boolean(serverBase())&&typeof window!=='undefined'&&
    'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
}
async function vapidKey():Promise<string|null>{
  const response=await api('/push/vapid-public-key');
  if(!response.ok)return null;
  const data=await response.json().catch(()=>null);
  return data?.configured&&typeof data?.key==='string'?data.key:null;
}
export async function pushState():Promise<PushSupport>{
  try{
    if(!await pushSupported())return 'unsupported';
    if(Notification.permission==='denied')return 'denied';
    if(!await vapidKey())return 'unconfigured';
    const registration=await navigator.serviceWorker.ready;
    const existing=await registration.pushManager.getSubscription();
    return existing?'enabled':'available';
  }catch{return 'unconfigured';}
}
/** Debe llamarse desde un gesto del usuario (el navegador pide permiso). */
export async function enablePush():Promise<PushSupport>{
  if(!await pushSupported())throw new Error('Este navegador no admite avisos push.');
  const key=await vapidKey();
  if(!key)throw new Error('Los avisos aún no están activados en el servidor.');
  const permission=await Notification.requestPermission();
  if(permission!=='granted')return 'denied';
  const registration=await navigator.serviceWorker.ready;
  const subscription=await registration.pushManager.subscribe({
    userVisibleOnly:true,applicationServerKey:urlB64ToUint8Array(key) as BufferSource,
  });
  const accessToken=await getOnlineAccessToken();
  if(!accessToken)throw new Error('Inicia sesión para activar los avisos.');
  const response=await api('/push/subscriptions',{accessToken,subscription:subscription.toJSON()});
  if(!response.ok)throw new Error((await response.json().catch(()=>null))?.error||'No se pudo guardar la suscripción.');
  return 'enabled';
}
export async function disablePush():Promise<void>{
  const registration=await navigator.serviceWorker.ready;
  const subscription=await registration.pushManager.getSubscription();
  const endpoint=subscription?.endpoint;
  if(subscription)await subscription.unsubscribe().catch(()=>{});
  const accessToken=await getOnlineAccessToken();
  if(accessToken&&endpoint)await api('/push/subscriptions/delete',{accessToken,endpoint}).catch(()=>{});
}
/** Aviso tras una acción social ya creada. Falla en silencio: nunca bloquea el juego. */
export async function notifySocial(kind:PushKind,params:{username?:string;invitation?:string}):Promise<void>{
  try{
    if(!await pushSupported())return;
    const accessToken=await getOnlineAccessToken();
    if(!accessToken)return;
    await api('/push/notify',{accessToken,kind,...params});
  }catch(error){console.warn('Aviso push no enviado',error);}
}
