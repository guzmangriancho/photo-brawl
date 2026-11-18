import type { FighterProfile } from '../types/fighter';

// V15/V16 compatible: do not rename this database, increment its version, or
// replace the custom_fighters store when adding Supabase. It belongs to the
// browser origin (a different domain or Safari/PWA may have a separate copy).
const API_KEY_STORAGE = 'photo_brawl_gemini_api_key';
const DB_NAME = 'PhotoBrawl16BitDB';
const DB_VERSION = 2;
const STORE_FIGHTERS = 'custom_fighters';
const BACKUP_FORMAT = 'photo-brawl-fighters-backup';
const BACKUP_VERSION = 1;

export function getGeminiApiKey(): string {
  try { return localStorage.getItem(API_KEY_STORAGE) || ''; } catch { return ''; }
}

export function setGeminiApiKey(key: string): void {
  try { localStorage.setItem(API_KEY_STORAGE, key.trim()); }
  catch (e) { console.error('Error saving API key to localStorage', e); }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB no está disponible. No borres datos ni reinstales la PWA.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Add missing stores, NEVER delete/recreate existing stores on upgrade.
      if (!db.objectStoreNames.contains(STORE_FIGHTERS)) db.createObjectStore(STORE_FIGHTERS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains('creator_drafts')) db.createObjectStore('creator_drafts', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () => reject(new Error('Cierra otras pestañas del juego antes de acceder a la colección.'));
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento local.'));
  });
}

export async function saveCustomFighter(fighter: FighterProfile): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FIGHTERS, 'readwrite');
    tx.objectStore(STORE_FIGHTERS).put(fighter);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('No se guardó el luchador.')); };
  });
}

/** Normalized, arcade-friendly name; game mechanics and artwork are never affected. */
export function normalizeFighterName(value:string):string {
  const name=value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().replace(/\s+/g,' ').toLocaleUpperCase('es');
  if (!name) throw new Error('Escribe un nombre para el luchador.');
  if ([...name].length>20) throw new Error('El nombre no puede superar los 20 caracteres.');
  return name;
}

/** Rename the existing IndexedDB row atomically: retain its id, artwork and all combat data. */
export async function renameCustomFighter(id:string,value:string):Promise<FighterProfile> {
  const fighterName=normalizeFighterName(value);
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_FIGHTERS,'readwrite');
    const store=tx.objectStore(STORE_FIGHTERS);
    const request=store.get(id);
    let result:FighterProfile|undefined;
    request.onsuccess=()=>{
      const original=request.result as FighterProfile|undefined;
      if (!original) { tx.abort(); return; }
      if (original.isPreset || original.id.startsWith('preset_')) { tx.abort(); return; }
      // Read the latest persisted profile rather than copying a possibly stale UI snapshot.
      const updated={...original,fighterName,nameUpdatedAt:Math.max(Date.now(),(original.nameUpdatedAt??0)+1)};
      store.put(updated);
      result=updated;
    };
    tx.oncomplete=()=>{db.close();resolve(result!);};
    tx.onerror=()=>{db.close();reject(tx.error??new Error('No se pudo cambiar el nombre.'));};
    tx.onabort=()=>{db.close();reject(new Error('El luchador no existe o no se puede renombrar.'));};
  });
}

/** Edit only the owner's existing local fighter. New art was validated and processed
 * by SpriteProcessor before calling this; never change the id or combat rules. */
export async function editCustomFighter(id:string, changes:{
  fighterName:string; portraitDataUrl?:string; spriteSheetDataUrl?:string;
  spriteSheetLastCell?:'PROJECTILE'|'KO';
}):Promise<FighterProfile> {
  const fighterName=normalizeFighterName(changes.fighterName);
  for(const art of [changes.portraitDataUrl,changes.spriteSheetDataUrl]){
    if(art!==undefined && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(art))
      throw new Error('La imagen debe ser un PNG procesado y válido.');
  }
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_FIGHTERS,'readwrite');
    const store=tx.objectStore(STORE_FIGHTERS);
    const req=store.get(id);
    let result:FighterProfile|undefined;
    req.onsuccess=()=>{
      const original=req.result as FighterProfile|undefined;
      if(!original || original.isPreset || original.id.startsWith('preset_')){tx.abort();return;}
      const nameChanged=original.fighterName!==fighterName;
      const artChanged=(changes.portraitDataUrl!==undefined && original.portraitDataUrl!==changes.portraitDataUrl) ||
        (changes.spriteSheetDataUrl!==undefined && original.spriteSheetDataUrl!==changes.spriteSheetDataUrl);
      const now=Date.now();
      const updated:FighterProfile={...original,fighterName,
        ...(nameChanged?{nameUpdatedAt:Math.max(now,(original.nameUpdatedAt??0)+1)}:{}),
        ...(artChanged?{artUpdatedAt:Math.max(now,(original.artUpdatedAt??0)+1)}:{}),
        ...(changes.portraitDataUrl!==undefined?{portraitDataUrl:changes.portraitDataUrl}:{}),
        ...(changes.spriteSheetDataUrl!==undefined?{spriteSheetDataUrl:changes.spriteSheetDataUrl,
          spriteSheetLayoutVersion:2 as const,spriteSheetKeyVersion:3 as const,
          spriteSheetLastCell:changes.spriteSheetLastCell??original.spriteSheetLastCell??'KO'}:{}),
      };
      if(nameChanged || artChanged)store.put(updated);
      result=updated;
    };
    tx.oncomplete=()=>{db.close();resolve(result!);};
    tx.onerror=()=>{db.close();reject(tx.error??new Error('No se pudieron guardar los cambios.'));};
    tx.onabort=()=>{db.close();reject(new Error('El luchador no existe o no se puede editar.'));};
  });
}

export async function getAllCustomFighters(): Promise<FighterProfile[]> {
  // Do NOT turn an IndexedDB error into an empty collection. A temporary
  // storage failure must not look like the player lost all their fighters.
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FIGHTERS, 'readonly');
    const req = tx.objectStore(STORE_FIGHTERS).getAll();
    let list: FighterProfile[] = [];
    req.onsuccess = () => { list = (req.result as FighterProfile[] || []).sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0)); };
    tx.oncomplete = () => { db.close(); resolve(list); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Error leyendo luchadores.')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Lectura de luchadores cancelada.')); };
  });
}

export async function deleteCustomFighter(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FIGHTERS, 'readwrite');
    tx.objectStore(STORE_FIGHTERS).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('No se borró el luchador.')); };
  });
}

/** Offline export includes ALL generated art and combat data, but NO original photo or API key. */
export async function exportLocalFightersBackup(): Promise<{blob:Blob;name:string;count:number}> {
  const fighters = (await getAllCustomFighters()).filter(f => !f.isPreset && !f.id.startsWith('preset_'));
  const payload = {format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), fighters};
  const blob = new Blob([JSON.stringify(payload)], {type:'application/json'});
  const name = `photo-brawl-luchadores-${new Date().toISOString().slice(0,10)}.json`;
  return {blob, name, count:fighters.length};
}

function validFighter(value: unknown): value is FighterProfile {
  if (!value || typeof value !== 'object') return false;
  const f = value as Partial<FighterProfile>;
  if (typeof f.id !== 'string' || !f.id.trim() || f.id.length > 180 || f.isPreset || f.id.startsWith('preset_')) return false;
  if (typeof f.fighterName !== 'string' || !f.fighterName.trim() || f.fighterName.length > 120) return false;
  if (typeof f.createdAt !== 'number' || !Number.isFinite(f.createdAt)) return false;
  if (typeof f.spriteSheetDataUrl !== 'string' || !/^data:image\/(png|webp|jpeg);base64,[\w+/=]+$/i.test(f.spriteSheetDataUrl)) return false;
  if (typeof f.portraitDataUrl !== 'string' || !/^data:image\/(png|webp|jpeg);base64,[\w+/=]+$/i.test(f.portraitDataUrl)) return false;
  if (!f.stats || !['hp','speed','power','technique'].every(k => Number.isFinite(f.stats![k as keyof typeof f.stats]))) return false;
  if (!f.moveset || !['lightNormal','heavyNormal','specialNeutral','specialForward','specialUp','ultimateSuper']
    .every(k => !!f.moveset![k as keyof typeof f.moveset] && typeof f.moveset![k as keyof typeof f.moveset].name === 'string')) return false;
  return true;
}

export function readLocalFightersBackup(text:string): FighterProfile[] {
  let parsed:unknown;
  try { parsed=JSON.parse(text); }
  catch { throw new Error('El archivo no contiene JSON válido.'); }
  if (!parsed || typeof parsed !== 'object' || (parsed as {format?:string}).format !== BACKUP_FORMAT ||
      (parsed as {version?:number}).version !== BACKUP_VERSION || !Array.isArray((parsed as {fighters?:unknown}).fighters)) {
    throw new Error('No es una copia de seguridad compatible de PHOTO BRAWL.');
  }
  const fighters = (parsed as {fighters:unknown[]}).fighters;
  if (fighters.length > 1000) throw new Error('La copia contiene demasiados personajes.');
  if (!fighters.every(validFighter)) throw new Error('La copia contiene un luchador incompleto o imágenes incorrectas. No se ha importado nada.');
  return fighters;
}

export type FighterMergeReport = {added:FighterProfile[]; updated:FighterProfile[]; unchanged:number; conflicts:number};

function canonicalMetadata(fighter:FighterProfile):string {
  // Supabase jsonb may reorder keys: canonicalize only small metadata, NOT art.
  const {id:_id,spriteSheetDataUrl:_sheet,portraitDataUrl:_portrait,...rest}=fighter;
  return JSON.stringify(rest, (_key,value)=>value && typeof value==='object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])) : value);
}
function sameFighterContent(a:FighterProfile,b:FighterProfile): boolean {
  return a.spriteSheetDataUrl===b.spriteSheetDataUrl &&
    a.portraitDataUrl===b.portraitDataUrl && canonicalMetadata(a)===canonicalMetadata(b);
}
function sameFighterExceptDisplayName(a:FighterProfile,b:FighterProfile):boolean {
  return a.spriteSheetDataUrl===b.spriteSheetDataUrl && a.portraitDataUrl===b.portraitDataUrl &&
    canonicalMetadata({...a,fighterName:'',nameUpdatedAt:undefined})===
    canonicalMetadata({...b,fighterName:'',nameUpdatedAt:undefined});
}

/** Same fighter identity/combat content, permitting newer edits to name and artwork. */
function sameFighterExceptEditableFields(a:FighterProfile,b:FighterProfile):boolean {
  const normalize=(f:FighterProfile)=>canonicalMetadata({...f,fighterName:'',nameUpdatedAt:undefined,
    artUpdatedAt:undefined,spriteSheetLayoutVersion:undefined,spriteSheetKeyVersion:undefined,
    spriteSheetLastCell:undefined});
  return normalize(a)===normalize(b);
}

function uniqueImportId():string {
  // crypto.randomUUID is unavailable in some LAN http:// development contexts.
  const uuid=typeof crypto!=='undefined' && typeof crypto.randomUUID==='function'
    ? crypto.randomUUID() : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  return `import_${uuid}`;
}

/**
 * Merge a backup or downloaded cloud collection into IndexedDB in ONE atomic
 * transaction. Never overwrite an existing local fighter, even when IDs match.
 * If an ID is reused for different artwork/stats, keep BOTH under different IDs.
 */
export async function mergeCustomFighters(incoming:FighterProfile[]):Promise<FighterMergeReport> {
  if (!incoming.every(validFighter)) throw new Error('Hay luchadores con datos inválidos. No se ha modificado tu colección.');
  const db = await openDatabase();
  return new Promise((resolve,reject) => {
    const added:FighterProfile[]=[], updated:FighterProfile[]=[];
    let unchanged=0, conflicts=0;
    const tx=db.transaction(STORE_FIGHTERS,'readwrite');
    const store=tx.objectStore(STORE_FIGHTERS);
    const req=store.getAll();
    req.onsuccess=()=>{
      const stored=req.result as FighterProfile[];
      const ids=new Set(stored.map(f=>f.id));
      for(const fighter of incoming){
        if(ids.has(fighter.id)){
          const original=stored.find(existing=>existing.id===fighter.id)!;
          // A rename is not a new fighter. Retain artwork and combat data;
          // accept only the newer explicitly dated display name.
          if(sameFighterExceptDisplayName(original,fighter)){
            if((fighter.nameUpdatedAt??0)>(original.nameUpdatedAt??0)){
              const renamed={...original,fighterName:fighter.fighterName,nameUpdatedAt:fighter.nameUpdatedAt};
              store.put(renamed);
              stored.splice(stored.indexOf(original),1,renamed);
              updated.push(renamed);
            }else{unchanged++;}
            continue;
          }
          // Same combat profile with edited art: newest named/art revisions win
          // independently. Do not fork a duplicate fighter on cloud restore.
          if(sameFighterExceptEditableFields(original,fighter) &&
             ((original.artUpdatedAt??0)!==(fighter.artUpdatedAt??0) ||
              original.spriteSheetDataUrl===fighter.spriteSheetDataUrl && original.portraitDataUrl===fighter.portraitDataUrl)){
            let merged=original;
            if((fighter.nameUpdatedAt??0)>(merged.nameUpdatedAt??0)){
              merged={...merged,fighterName:fighter.fighterName,nameUpdatedAt:fighter.nameUpdatedAt};
            }
            if((fighter.artUpdatedAt??0)>(merged.artUpdatedAt??0)){
              merged={...merged,portraitDataUrl:fighter.portraitDataUrl,
                spriteSheetDataUrl:fighter.spriteSheetDataUrl,artUpdatedAt:fighter.artUpdatedAt,
                spriteSheetKeyVersion:fighter.spriteSheetKeyVersion,
                spriteSheetLayoutVersion:fighter.spriteSheetLayoutVersion,
                spriteSheetLastCell:fighter.spriteSheetLastCell};
            }
            if(!sameFighterContent(merged,original)){
              store.put(merged);stored.splice(stored.indexOf(original),1,merged);updated.push(merged);
            } else unchanged++;
            continue;
          }
          if(stored.some(existing=>sameFighterContent(existing,fighter))){unchanged++;continue;}
          // A previously imported copy should not be duplicated every time.
          const similar=stored.some(existing=>sameFighterContent(existing,fighter));
          if(similar){unchanged++;continue;}
          let id:string;
          do {id=uniqueImportId();} while(ids.has(id));
          const copy={...fighter,id};
          store.put(copy);stored.push(copy);ids.add(id);added.push(copy);conflicts++;
        }else{
          store.put(fighter);stored.push(fighter);ids.add(fighter.id);added.push(fighter);
        }
      }
    };
    tx.oncomplete=()=>{db.close();resolve({added,updated,unchanged,conflicts});};
    tx.onerror=()=>{db.close();reject(tx.error ?? new Error('Error importando personajes. No se ha importado nada.'));};
    tx.onabort=()=>{db.close();reject(tx.error ?? new Error('Importación cancelada. No se ha importado nada.'));};
  });
}
