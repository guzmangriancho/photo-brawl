/** PHOTO BRAWL V20 · Real, two-party ownership transfer, not a download/share link. */
import type {FighterProfile} from '../types/fighter';
import {supabase} from './supabaseClient';
import {cloudEntry,saveFighterCloud} from './communityService';
import {deleteCustomFighter,getAllCustomFighters,mergeCustomFighters} from './storageService';

export type FighterTransfer = {
  id:string;fighter_id:string;sender_id:string;recipient_id:string;
  original_local_id:string;source_sheet_path:string;source_portrait_path:string;
  fighter_name:string; status:'pending'|'accepted'|'declined'|'cancelled';
  created_at:string;expires_at:string;responded_at:string|null;
};
export type TransferWithUser = FighterTransfer & {username:string;displayName:string};
function client(){if(!supabase)throw new Error('Configura Supabase para usar transferencias.');return supabase;}
async function signedIn():Promise<string>{
  const {data,error}=await client().auth.getUser();
  if(error||!data.user)throw new Error('Inicia sesión en CUENTA para enviar o recibir luchadores.');
  return data.user.id;
}
const limit=40;
export async function listFighterTransfers():Promise<{incoming:TransferWithUser[];outgoing:TransferWithUser[]}> {
  const uid=await signedIn();
  const db=client();
  const [a,b]=await Promise.all([
    db.from('fighter_transfers').select('*').eq('recipient_id',uid).order('created_at',{ascending:false}).limit(limit),
    db.from('fighter_transfers').select('*').eq('sender_id',uid).order('created_at',{ascending:false}).limit(limit),
  ]);
  if(a.error)throw a.error;if(b.error)throw b.error;
  const incoming=(a.data??[]) as FighterTransfer[],outgoing=(b.data??[]) as FighterTransfer[];
  const userIds=[...new Set([...incoming.map(t=>t.sender_id),...outgoing.map(t=>t.recipient_id)])];
  const {data:profiles,error}=userIds.length
    ?await db.from('player_profiles').select('id,username,display_name').in('id',userIds)
    :{data:[],error:null};
  if(error)throw error;
  type PublicProfile={id:string;username:string;display_name:string};
  const users=new Map<string,{username:string;displayName:string}>(
    ((profiles??[]) as PublicProfile[]).map((row):[string,{username:string;displayName:string}]=>[
      row.id,{username:row.username,displayName:row.display_name},
    ]),
  );
  const withUsers=(list:FighterTransfer[],out:boolean)=>list.map(t=>({
    ...t,username:users.get(out?t.recipient_id:t.sender_id)?.username??'usuario',
    displayName:users.get(out?t.recipient_id:t.sender_id)?.displayName??'JUGADOR',
  }));
  return {incoming:withUsers(incoming,false),outgoing:withUsers(outgoing,true)};
}

export async function sendFighterTransfer(fighter:FighterProfile,username:string):Promise<void>{
  if(!username.trim())throw new Error('Escribe el usuario único de tu amigo.');
  if(fighter.isPreset||fighter.id.startsWith('preset_'))throw new Error('No se puede transferir un luchador del tutorial.');
  const uid=await signedIn();
  // Bind this local collection to the sending account if it has no legacy binding yet.
  try{
    const bound=localStorage.getItem('pb-local-fighters-cloud-owner-v16-2');
    if(bound&&bound!==uid)throw new Error('Este dispositivo guarda la colección de otra cuenta. No se puede transferir desde esta sesión.');
    if(!bound)localStorage.setItem('pb-local-fighters-cloud-owner-v16-2',uid);
  }catch(error){if(error instanceof Error)throw error;throw new Error('No se pudo proteger la propiedad local.');}
  const existing=await cloudEntry(fighter.id);
  // Account can only send its own synced fighter, not somebody else's public fighter.
  if(existing?.is_public)throw new Error('Primero oculta este luchador desde Comunidad → Publicar.');
  const saved=existing??await saveFighterCloud(fighter);
  if(saved.owner_id!==uid)throw new Error('Este luchador no pertenece a tu cuenta.');
  if(saved.is_public)throw new Error('Primero deja de publicarlo en la comunidad.');
  const {error}=await client().rpc('offer_fighter_transfer',{
    p_fighter_id:saved.id,p_recipient_username:username.trim().toLowerCase(),
  });
  if(error)throw error;
}
export async function rejectFighterTransfer(id:string):Promise<void>{
  await signedIn();const {error}=await client().rpc('respond_fighter_transfer',{p_transfer_id:id,p_action:'declined'});
  if(error)throw error;
}
export async function cancelFighterTransfer(id:string):Promise<void>{
  await signedIn();const {error}=await client().rpc('respond_fighter_transfer',{p_transfer_id:id,p_action:'cancelled'});
  if(error)throw error;
}

type TransferPayload = {
  fighter_id:string;fighter_data:Omit<FighterProfile,'spriteSheetDataUrl'|'portraitDataUrl'>;
  private_sheet_path:string;private_portrait_path:string;fighter_name:string;
};
function dataUrl(blob:Blob):Promise<string>{
 return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('Error leyendo sprites'));r.readAsDataURL(blob);});
}
async function uploadPrivate(path:string,blob:Blob){
 const {error}=await client().storage.from('fighter-private').upload(path,blob,{
   upsert:true,contentType:blob.type||'image/png',cacheControl:'3600',
 });
 if(error)throw error;
}
/**
 * 1. Download precisely the two private artworks allowed by a pending offer.
 * 2. Upload to recipient's OWN private Storage prefix (never use public bucket).
 * 3. Transactional RPC changes owner of the SINGLE canonical fighter row.
 * 4. Import into IndexedDB. If the last step fails, account cloud recovery remains possible.
 */
export async function acceptFighterTransfer(id:string):Promise<FighterProfile>{
 const uid=await signedIn(),db=client();
 const {data:payload,error:payloadError}=await db.rpc('get_transfer_payload',{p_transfer_id:id});
 if(payloadError)throw payloadError;
 const f=payload as TransferPayload;
 const [portrait,sheet]=await Promise.all([
   db.storage.from('fighter-private').download(f.private_portrait_path),
   db.storage.from('fighter-private').download(f.private_sheet_path),
 ]);
 if(portrait.error||!portrait.data||sheet.error||!sheet.data)
   throw new Error(`No se pudieron descargar las imágenes: ${portrait.error?.message??sheet.error?.message??'reintenta'}`);
 const portraitPath=`${uid}/${f.fighter_id}/portrait.png`,sheetPath=`${uid}/${f.fighter_id}/sheet.png`;
 await Promise.all([uploadPrivate(portraitPath,portrait.data),uploadPrivate(sheetPath,sheet.data)]);
 const {data:result,error:acceptError}=await db.rpc('accept_fighter_transfer',{
   p_transfer_id:id,p_new_portrait_path:portraitPath,p_new_sheet_path:sheetPath,
 });
 if(acceptError)throw acceptError;
 const localId=String((result as {local_id?:string}).local_id??`gift_${f.fighter_id}`);
 const fighter={...f.fighter_data,id:localId,createdAt:Date.now(),isPreset:false,
   spriteSheetDataUrl:await dataUrl(sheet.data),portraitDataUrl:await dataUrl(portrait.data)} as FighterProfile;
 const merged=await mergeCustomFighters([fighter]);
 if(!merged.added.length && !merged.unchanged && !merged.updated.length)
   throw new Error('Transferido a tu nube, pero no se pudo guardar localmente. Usa CUENTA → MIS COPIAS → RECUPERAR DE LA NUBE.');
 window.dispatchEvent(new Event('pb-roster-refresh'));
 return fighter;
}

/** Delete only after Supabase confirms ownership changed to the recipient.
 * The cloud DB also prevents old automatic backups resurrecting a transferred fighter.
 * This runs on app boot, focus, auth login, and periodically while open.
 */
export async function reconcileSentFighterTransfers():Promise<number>{
 if(!supabase)return 0;
 const {data:{user}}=await supabase.auth.getUser();if(!user)return 0;
 // This device may belong to a different signed-in account; never touch its collection.
 try{if(localStorage.getItem('pb-local-fighters-cloud-owner-v16-2')!==user.id)return 0;}
 catch{return 0;}
 const {data,error}=await supabase.from('fighter_transfers')
   .select('id,original_local_id,source_sheet_path,source_portrait_path')
   .eq('sender_id',user.id).eq('status','accepted').limit(200);
 if(error)throw error;
 const stored=new Set((await getAllCustomFighters()).map(f=>f.id));
 let removed=0;
 for(const transfer of data??[]){
   if(stored.has(transfer.original_local_id)){
     await deleteCustomFighter(transfer.original_local_id);
     removed++;
   }
   // Original assets are no longer used by the moved canonical row.
   // Best-effort cleanup; retry next visit if Storage fails.
   if(transfer.source_sheet_path&&transfer.source_portrait_path){
     const {error:cleanupError}=await supabase.storage.from('fighter-private').remove([
       transfer.source_sheet_path,transfer.source_portrait_path,
     ]);
     if(cleanupError)console.warn('Limpieza pendiente de imágenes transferidas',cleanupError);
   }
 }
 if(removed)window.dispatchEvent(new Event('pb-roster-refresh'));
 return removed;
}
