import type { FighterProfile } from '../types/fighter';
import { supabase } from './supabaseClient';

function needDb() {
  if (!supabase) throw new Error('La comunidad aún no está configurada. Añade VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en Vercel.');
  return supabase;
}
async function currentUserId(): Promise<string> {
  const { data, error } = await needDb().auth.getUser();
  if (error || !data.user) throw new Error('Inicia sesión para guardar tus luchadores en la nube.');
  return data.user.id;
}
function imageBlob(dataUrl: string): Blob {
  const [prefix, base64] = dataUrl.split(',');
  if (!base64 || !/^data:image\/(png|webp|jpeg);base64$/i.test(prefix)) throw new Error('El retrato o spritesheet no es una imagen válida.');
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i=0;i<bytes.length;i++) arr[i]=bytes.charCodeAt(i);
  return new Blob([arr], {type:prefix.slice(5,-7)});
}
function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result));
    reader.onerror=()=>reject(new Error('No se pudo recuperar el archivo de la nube.'));
    reader.readAsDataURL(blob);
  });
}
async function putImage(bucket: string,path: string,dataUrl: string) {
  const file=imageBlob(dataUrl);
  const { error }=await needDb().storage.from(bucket).upload(path,file,{
    contentType:file.type,upsert:true,cacheControl:'3600',
  });
  if(error) throw error;
}
function fighterMetadata(fighter:FighterProfile):Record<string,unknown> {
  const { spriteSheetDataUrl,portraitDataUrl,...safe }=fighter;
  if(fighter.isPreset || fighter.id.startsWith('preset_')) throw new Error('Los luchadores del tutorial no se pueden publicar.');
  return safe;
}
export type CloudFighter = {
  id:string; owner_id:string; local_id:string; fighter_name:string; archetype:string;
  fighter_data:Omit<FighterProfile,'spriteSheetDataUrl'|'portraitDataUrl'>;
  is_public:boolean; private_portrait_path:string; private_sheet_path:string;
  public_portrait_path:string|null; public_sheet_path:string|null; created_at:string;
};
export type CommunityFighter = Pick<CloudFighter,'id'|'owner_id'|'fighter_name'|'archetype'|'fighter_data'|'public_portrait_path'|'public_sheet_path'|'created_at'> & {
  player_profiles?:{username:string;display_name:string}|null;
};
export type LeaderboardPlayer = {id:string;username:string;display_name:string;rating:number;wins:number;losses:number};

export async function cloudEntry(localId:string):Promise<CloudFighter|null> {
  const userId=await currentUserId();
  const {data,error}=await needDb().from('fighters').select('*').eq('owner_id',userId).eq('local_id',localId).maybeSingle();
  if(error)throw error;
  return data as CloudFighter|null;
}
export async function saveFighterCloud(fighter:FighterProfile):Promise<CloudFighter> {
  const uid=await currentUserId();
  const cleaned=fighterMetadata(fighter);
  const existing=await cloudEntry(fighter.id);
  const id=existing?.id || crypto.randomUUID();
  const portrait=`${uid}/${id}/portrait.png`,sheet=`${uid}/${id}/sheet.png`;
  await putImage('fighter-private',portrait,fighter.portraitDataUrl);
  await putImage('fighter-private',sheet,fighter.spriteSheetDataUrl);
  const body={owner_id:uid,local_id:fighter.id,fighter_name:fighter.fighterName.slice(0,40),archetype:fighter.archetype,
    fighter_data:cleaned,private_portrait_path:portrait,private_sheet_path:sheet,updated_at:new Date().toISOString()};
  const request=existing?needDb().from('fighters').update(body).eq('id',existing.id):needDb().from('fighters').insert({...body,id});
  const {data,error}=await request.select('*').single();
  if(error)throw error;
  return data as CloudFighter;
}
export async function publishFighter(fighter:FighterProfile):Promise<CloudFighter> {
  const saved=await saveFighterCloud(fighter);
  const prefix=`${saved.owner_id}/${saved.id}`;
  const portrait=`${prefix}/portrait.png`,sheet=`${prefix}/sheet.png`;
  await putImage('fighter-public',portrait,fighter.portraitDataUrl);
  await putImage('fighter-public',sheet,fighter.spriteSheetDataUrl);
  const {data,error}=await needDb().from('fighters').update({is_public:true,public_portrait_path:portrait,public_sheet_path:sheet})
    .eq('id',saved.id).eq('owner_id',saved.owner_id).select('*').single();
  if(error)throw error;
  return data as CloudFighter;
}
export async function unpublishFighter(fighter:FighterProfile):Promise<void> {
  const saved=await cloudEntry(fighter.id);
  if(!saved)return;
  const {error}=await needDb().from('fighters').update({is_public:false,public_portrait_path:null,public_sheet_path:null}).eq('id',saved.id);
  if(error)throw error;
  const paths=[saved.public_portrait_path,saved.public_sheet_path].filter((path):path is string=>Boolean(path));
  if(paths.length){const {error:removeError}=await needDb().storage.from('fighter-public').remove(paths); if(removeError)throw removeError;}
}
export type CloudRestoreReport = {fighters:FighterProfile[]; failed:string[]; total:number};

/** Download every private fighter. A failed asset is reported, never silently hidden. */
export async function restoreCloudFightersReport():Promise<CloudRestoreReport> {
  const uid=await currentUserId();
  const db=needDb();
  const rows:CloudFighter[]=[];
  const size=40;
  for(let offset=0;offset<10000;offset+=size){
    const {data,error}=await db.from('fighters').select('*').eq('owner_id',uid)
      .order('created_at',{ascending:false}).range(offset,offset+size-1);
    if(error)throw error;
    const page=(data||[]) as CloudFighter[];
    rows.push(...page);
    if(page.length<size)break;
  }
  const fighters:FighterProfile[]=[], failed:string[]=[];
  for(const row of rows){
    try{
      const [sprite,portrait]=await Promise.all([
        db.storage.from('fighter-private').download(row.private_sheet_path),
        db.storage.from('fighter-private').download(row.private_portrait_path),
      ]);
      if(sprite.error || !sprite.data || portrait.error || !portrait.data){
        throw new Error(sprite.error?.message||portrait.error?.message||'Faltan imágenes');
      }
      fighters.push({...row.fighter_data,id:row.local_id,
        spriteSheetDataUrl:await toDataUrl(sprite.data),portraitDataUrl:await toDataUrl(portrait.data)} as FighterProfile);
    }catch(error){
      failed.push(`${row.fighter_name}: ${error instanceof Error?error.message:'No se pudo descargar'}`);
    }
  }
  return {fighters,failed,total:rows.length};
}

/** Compatibility for older callers; new UI uses the detailed failure report. */
export async function restoreCloudFighters():Promise<FighterProfile[]> {
  const report=await restoreCloudFightersReport();
  if(report.failed.length)throw new Error(`No se pudieron descargar ${report.failed.length} luchadores. Ninguno se ha importado. ${report.failed[0]}`);
  return report.fighters;
}

/** Safe one-way, opt-in migration: never replace cloud rows sharing a local ID. */
export async function backupMissingLocalFighters(fighters:FighterProfile[],onProgress?:(done:number,total:number)=>void,expectedUserId?:string):Promise<{uploaded:number;existing:number;failed:string[]}> {
  const initialUser=await currentUserId();
  if(expectedUserId && initialUser!==expectedUserId)throw new Error('La cuenta cambió; no se ha subido ningún luchador.');
  let uploaded=0,existing=0;
  const failed:string[]=[];
  for(let i=0;i<fighters.length;i++){
    const fighter=fighters[i];
    try{
      if(expectedUserId && await currentUserId()!==expectedUserId)throw new Error('La sesión cambió durante la copia.');
      if(await cloudEntry(fighter.id)){existing++;}
      else{await saveFighterCloud(fighter);uploaded++;}
    }catch(error){failed.push(`${fighter.fighterName}: ${error instanceof Error?error.message:'No se pudo guardar'}`);}
    onProgress?.(i+1,fighters.length);
  }
  return {uploaded,existing,failed};
}
export async function listCommunity(search='',page=0,pageSize=6):Promise<CommunityFighter[]> {
  const db=needDb();
  let q=db.from('fighters').select('id,owner_id,fighter_name,archetype,fighter_data,public_portrait_path,public_sheet_path,created_at,player_profiles!fighters_owner_id_fkey(username,display_name)')
    .eq('is_public',true).order('created_at',{ascending:false}).range(page*pageSize,(page+1)*pageSize-1);
  if(search.trim())q=q.ilike('fighter_name',`%${search.trim().replace(/[%_,().]/g,'').slice(0,40)}%`);
  const {data,error}=await q;
  if(error)throw error;
  return (data||[]) as unknown as CommunityFighter[];
}
export function fighterPublicUrl(path:string|null|undefined):string {
  return !path?'':needDb().storage.from('fighter-public').getPublicUrl(path).data.publicUrl;
}
export async function leaderboard():Promise<LeaderboardPlayer[]> {
  const {data,error}=await needDb().from('player_profiles').select('id,username,display_name,rating,wins,losses')
    .or('wins.gt.0,losses.gt.0').order('rating',{ascending:false}).order('wins',{ascending:false}).limit(50);
  if(error)throw error;
  return (data||[]) as LeaderboardPlayer[];
}
export async function getPublicProfile(id:string):Promise<{player:LeaderboardPlayer|null;fighters:CommunityFighter[]}> {
  const db=needDb();
  const [u,f]=await Promise.all([
    db.from('player_profiles').select('id,username,display_name,rating,wins,losses').eq('id',id).maybeSingle(),
    db.from('fighters').select('id,owner_id,fighter_name,archetype,fighter_data,public_portrait_path,public_sheet_path,created_at')
      .eq('is_public',true).eq('owner_id',id).order('created_at',{ascending:false}).limit(12),
  ]);
  if(u.error)throw u.error;if(f.error)throw f.error;
  return {player:u.data as LeaderboardPlayer|null,fighters:(f.data||[]) as CommunityFighter[]};
}
export async function toggleFighterLike(fighterId:string,liked:boolean):Promise<void> {
  const uid=await currentUserId();
  if(liked){const {error}=await needDb().from('fighter_likes').delete().eq('fighter_id',fighterId).eq('user_id',uid);if(error)throw error;}
  else {const {error}=await needDb().from('fighter_likes').insert({fighter_id:fighterId,user_id:uid});if(error)throw error;}
}
export async function fighterLikes(fighterId:string,userId?:string):Promise<{count:number;liked:boolean}> {
  const {data,error}=await needDb().from('fighter_likes').select('user_id').eq('fighter_id',fighterId);
  if(error)throw error;
  return {count:data?.length||0,liked:Boolean(userId&&data?.some(entry=>entry.user_id===userId))};
}
export async function deleteCloudFighter(localId:string):Promise<void> {
  const entry=await cloudEntry(localId);
  if(!entry)return;
  const db=needDb();
  const {error}=await db.from('fighters').delete().eq('id',entry.id).eq('owner_id',entry.owner_id);
  if(error)throw error;
  const privatePaths=[entry.private_portrait_path,entry.private_sheet_path];
  await db.storage.from('fighter-private').remove(privatePaths);
  const publicPaths=[entry.public_portrait_path,entry.public_sheet_path].filter((v):v is string=>Boolean(v));
  if(publicPaths.length)await db.storage.from('fighter-public').remove(publicPaths);
}
