import {supabase} from './supabaseClient';
import {cloudEntry, fighterPublicUrl} from './communityService';
import type {FighterProfile,FighterDesignSchema} from '../types/fighter';
import {ULTIMATE_CUPS,ULTIMATE_WINS,ultimateUnlocked,validateUltimateJson} from './ultimatePrompts';

export interface UltimateRow {
  fighter_id:string; owner_id:string; design:FighterDesignSchema;
  portrait_path:string; sheet_path:string;
  public_portrait_path:string|null; public_sheet_path:string|null;
  updated_at:string;
}
export interface UltimateReady {design:FighterDesignSchema;portraitDataUrl:string;spriteSheetDataUrl:string;}
export interface UltimateProgress {best_trophies:number;wins:number;trophies:number;unlocked:boolean;}
function db(){if(!supabase)throw new Error('Supabase no está conectado.');return supabase;}
function imageBlob(dataUrl:string):Blob{
  if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl))throw new Error('El arte Ultimate debe ser PNG procesado.');
  const bytes=atob(dataUrl.split(',')[1]);const arr=new Uint8Array(bytes.length);
  for(let i=0;i<bytes.length;i++)arr[i]=bytes.charCodeAt(i);
  return new Blob([arr],{type:'image/png'});
}
async function asDataUrl(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('No se pudo leer el arte Ultimate.'));reader.readAsDataURL(blob);
});}
export function applyUltimate(base:FighterProfile,form:UltimateReady):FighterProfile{
  // Preserves canonical base id: cups, history, transfer and match identity never split.
  // Server independently validates the authoritative saved evolution in ranked.
  return {...base,...form.design,id:base.id,isPreset:false,
    portraitDataUrl:form.portraitDataUrl,spriteSheetDataUrl:form.spriteSheetDataUrl,
    spriteSheetLayoutVersion:2,spriteSheetKeyVersion:3,
    spriteSheetLastCell:['STRAIGHT_FIREBALL','ARCING_LOB_OBJECT','BOOMERANG_RETURN','TRAP_MINE_DROP']
      .includes(form.design.moveset.specialNeutral.mechanic)?'PROJECTILE':'KO',
    ultimateForm:true,baseFighterName:base.fighterName};
}
export async function ultimateProgress(localId:string):Promise<UltimateProgress>{
  const entry=await cloudEntry(localId);
  if(!entry)throw new Error('Primero sincroniza este luchador con tu cuenta.');
  const {data,error}=await db().from('fighter_progress').select('trophies,best_trophies,wins').eq('fighter_id',entry.id).maybeSingle();
  if(error)throw error;
  const progress={trophies:data?.trophies??0,best_trophies:data?.best_trophies??0,wins:data?.wins??0};
  return {...progress,unlocked:ultimateUnlocked(progress)};
}
export async function getUltimateRow(localId:string):Promise<UltimateRow|null>{
  const entry=await cloudEntry(localId);if(!entry)return null;
  const {data,error}=await db().from('fighter_ultimate_forms').select('*').eq('fighter_id',entry.id).maybeSingle();
  if(error)throw error;
  return data as UltimateRow|null;
}
export async function loadUltimate(localId:string):Promise<UltimateReady|null>{
  const row=await getUltimateRow(localId);
  if(!row)return null;
  const [portrait,sheet]=await Promise.all([
    db().storage.from('fighter-private').download(row.portrait_path),
    db().storage.from('fighter-private').download(row.sheet_path),
  ]);
  if(portrait.error||sheet.error||!portrait.data||!sheet.data)throw new Error('No se pudo recuperar la forma Ultimate de Supabase.');
  return {design:row.design,portraitDataUrl:await asDataUrl(portrait.data),spriteSheetDataUrl:await asDataUrl(sheet.data)};
}
async function upload(bucket:string,path:string,data:string){
  const file=imageBlob(data);
  if(file.size>3_100_000)throw new Error('El arte excede 3 MB. Optimiza el PNG y vuelve a intentarlo.');
  const {error}=await db().storage.from(bucket).upload(path,file,{contentType:'image/png',upsert:false});
  if(error)throw error;
}
export async function saveUltimate(base:FighterProfile,form:UltimateReady):Promise<void>{
  const design=validateUltimateJson(base,form.design);
  const progress=await ultimateProgress(base.id);
  if(!progress.unlocked)throw new Error(`Desbloqueo: ${ULTIMATE_CUPS} copas máximas o ${ULTIMATE_WINS} victorias clasificatorias.`);
  const previous=await getUltimateRow(base.id);
  const row=await cloudEntry(base.id);
  if(!row)throw new Error('Luchador no sincronizado.');
  const {data:{user}}=await db().auth.getUser();
  if(!user||user.id!==row.owner_id)throw new Error('El luchador no pertenece a esta cuenta.');
  const prefix=`${user.id}/${row.id}/ultimate-${crypto.randomUUID()}`;
  const portrait=`${prefix}/portrait.png`,sheet=`${prefix}/sheet.png`;
  const assets:Array<{bucket:string;path:string}>=[];
  const pubPortrait=row.is_public?portrait:null;
  const pubSheet=row.is_public?sheet:null;
  try{
    await upload('fighter-private',portrait,form.portraitDataUrl);assets.push({bucket:'fighter-private',path:portrait});
    await upload('fighter-private',sheet,form.spriteSheetDataUrl);assets.push({bucket:'fighter-private',path:sheet});
    if(pubPortrait&&pubSheet){
      await upload('fighter-public',pubPortrait,form.portraitDataUrl);assets.push({bucket:'fighter-public',path:pubPortrait});
      await upload('fighter-public',pubSheet,form.spriteSheetDataUrl);assets.push({bucket:'fighter-public',path:pubSheet});
    }
    const {error}=await db().rpc('pb_save_ultimate_form',{
      p_local_id:base.id,p_design:design,p_portrait_path:portrait,p_sheet_path:sheet,
      p_public_portrait_path:pubPortrait,p_public_sheet_path:pubSheet,
    });
    if(error)throw error;
    // Do not leave superseded portraits publicly accessible after editing a form.
    if(previous){
      const privateOld=[previous.portrait_path,previous.sheet_path].filter(v=>v!==portrait&&v!==sheet);
      const publicOld=[previous.public_portrait_path,previous.public_sheet_path]
        .filter((v):v is string=>Boolean(v)&&v!==pubPortrait&&v!==pubSheet);
      if(privateOld.length)void db().storage.from('fighter-private').remove(privateOld).catch(()=>{});
      if(publicOld.length)void db().storage.from('fighter-public').remove(publicOld).catch(()=>{});
    }
  }catch(err){
    // Only delete media staged by this failed attempt; previous Ultimate stays intact.
    await Promise.allSettled(assets.map(a=>db().storage.from(a.bucket).remove([a.path])));
    throw err;
  }
}
/** Publication can happen AFTER awakening: make its already-validated public art available. */
export async function publishUltimateIfPresent(localId:string):Promise<void>{
  const row=await getUltimateRow(localId);if(!row||row.public_portrait_path)return;
  const entry=await cloudEntry(localId);if(!entry?.is_public)return;
  const [portrait,sheet]=await Promise.all([
    db().storage.from('fighter-private').download(row.portrait_path),
    db().storage.from('fighter-private').download(row.sheet_path),
  ]);
  if(portrait.error||sheet.error||!portrait.data||!sheet.data)throw new Error('No se pudo publicar el arte Ultimate.');
  const prefix=`${entry.owner_id}/${entry.id}/ultimate-public-${crypto.randomUUID()}`;
  const p=`${prefix}/portrait.png`,s=`${prefix}/sheet.png`;
  try{
    const [pData,sData]=await Promise.all([asDataUrl(portrait.data),asDataUrl(sheet.data)]);
    await upload('fighter-public',p,pData);await upload('fighter-public',s,sData);
    const {error}=await db().rpc('pb_publish_ultimate_art',{p_local_id:localId,p_public_portrait_path:p,p_public_sheet_path:s});
    if(error)throw error;
  }catch(error){await db().storage.from('fighter-public').remove([p,s]).catch(()=>{});throw error;}
}
/** Remove copies when a fighter is hidden from Community. Server also clears URLs. */
export async function removePublicUltimateArtwork(paths:string[]):Promise<void>{
  if(!paths.length)return;
  const {error}=await db().storage.from('fighter-public').remove(paths);
  if(error)throw error;
}

/** Public-safe artwork only. Private form data/art is excluded by RLS and URLs. */
export async function publicUltimateArtwork(ids:string[]):Promise<Record<string,{portraitUrl:string;sheetUrl:string;name:string;design:FighterDesignSchema}>>{
  if(!ids.length)return {};
  const {data,error}=await db().from('fighter_ultimate_forms')
    .select('fighter_id,public_portrait_path,public_sheet_path,design').in('fighter_id',ids.slice(0,100));
  if(error)throw error;
  return Object.fromEntries((data||[]).filter(v=>v.public_portrait_path&&v.public_sheet_path)
    .map(v=>[v.fighter_id,{portraitUrl:fighterPublicUrl(v.public_portrait_path!),
      sheetUrl:fighterPublicUrl(v.public_sheet_path!),name:(v.design as FighterDesignSchema).fighterName,design:v.design as FighterDesignSchema}]));
}
