/** V53 · One public profile avatar backed by an owned cloud fighter.
 * The fighter itself can remain private: only its selected portrait is copied
 * to a separate public avatar file when the owner explicitly marks it favorite.
 */
import type {FighterProfile} from '../types/fighter';
import {supabase} from './supabaseClient';
import {cloudEntry,saveFighterCloud} from './communityService';

export interface FavoriteFighter {localId:string|null;avatarPath:string|null;}
export const FAVORITE_CHANGED='pb-favorite-fighter-changed';
const EMPTY:FavoriteFighter={localId:null,avatarPath:null};
const avatarPattern=/^[0-9a-f-]{36}\/avatars\/[0-9a-f-]{36}\.(?:png|webp|jpeg)$/i;

function db(){if(!supabase)throw new Error('Supabase no está configurado.');return supabase;}
async function userId(){const {data,error}=await db().auth.getUser();if(error)throw error;if(!data.user)throw new Error('Inicia sesión para seleccionar tu favorito.');return data.user.id;}
export function avatarPublicUrl(path:string|null|undefined):string{
  if(!path||!avatarPattern.test(path)||!supabase)return '';
  return supabase.storage.from('fighter-public').getPublicUrl(path).data.publicUrl;
}
export async function readFavoriteFighter(accountId:string):Promise<FavoriteFighter>{
  const {data,error}=await db().from('player_profiles').select('favorite_fighter_id,favorite_avatar_path').eq('id',accountId).maybeSingle();
  if(error)throw error;
  if(!data?.favorite_fighter_id)return EMPTY;
  const {data:fighter,error:fighterError}=await db().from('fighters').select('local_id')
    .eq('owner_id',accountId).eq('id',data.favorite_fighter_id).maybeSingle();
  if(fighterError)throw fighterError;
  return {localId:fighter?.local_id??null,avatarPath:data.favorite_avatar_path??null};
}

const checkedImage=(fighter:FighterProfile):Blob=>{
  const match=/^data:image\/(png|webp|jpeg);base64,([\w+/=]+)$/i.exec(fighter.portraitDataUrl);
  if(!match)throw new Error('El retrato del luchador no es una imagen válida.');
  const binary=atob(match[2]);
  if(binary.length>5*1024*1024)throw new Error('El retrato supera los 5 MB permitidos para el perfil.');
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:`image/${match[1].toLowerCase()}`});
};
function broadcast(){window.dispatchEvent(new Event(FAVORITE_CHANGED));}

/** Mark, replace, or unset a favorite; never publishes the fighter's stats or sheet. */
export async function writeFavoriteFighter(fighter:FighterProfile|null):Promise<void>{
  const uid=await userId();
  const client=db();
  const {data:previous,error:profileError}=await client.from('player_profiles')
    .select('favorite_avatar_path').eq('id',uid).single();
  if(profileError)throw profileError;
  let newPath:string|null=null,cloudId:string|null=null;
  try{
    if(fighter){
      if(fighter.isPreset||fighter.id.startsWith('preset_'))throw new Error('Selecciona un luchador de tu colección.');
      const blob=checkedImage(fighter);
      const saved=await cloudEntry(fighter.id)??await saveFighterCloud(fighter);
      cloudId=saved.id;
      newPath=`${uid}/avatars/${crypto.randomUUID()}.${blob.type.split('/')[1]}`;
      const {error:uploadError}=await client.storage.from('fighter-public').upload(newPath,blob,{contentType:blob.type,upsert:false,cacheControl:'3600'});
      if(uploadError)throw uploadError;
    }
    if(await userId()!==uid)throw new Error('La cuenta cambió. No se ha modificado el favorito.');
    const {data:updated,error:saveError}=await client.from('player_profiles')
      .update({favorite_fighter_id:cloudId,favorite_avatar_path:newPath}).eq('id',uid).select('id').maybeSingle();
    if(saveError)throw saveError;
    if(!updated)throw new Error('No se pudo actualizar el favorito de esta cuenta.');
  }catch(error){
    if(newPath)await client.storage.from('fighter-public').remove([newPath]).catch(()=>{});
    throw error;
  }
  broadcast();
  const oldPath=previous?.favorite_avatar_path;
  if(oldPath&&oldPath!==newPath&&avatarPattern.test(oldPath)&&oldPath.startsWith(`${uid}/avatars/`)){
    // Best effort: after commit, failure to clean up an old public copy must not
    // make a successful favorite selection appear to have failed.
    void client.storage.from('fighter-public').remove([oldPath]);
  }
}
