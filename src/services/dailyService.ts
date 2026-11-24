/** V58 · Combate diario: mismo luchador de la comunidad y escenario para todos (día UTC).
 * Solo lectura de recompensas en el navegador; la victoria la valida y registra la RPC. */
import type {FighterProfile} from '../types/fighter';
import type {StageId} from '../types/fighter';
import {supabase} from './supabaseClient';
import {fighterPublicUrl} from './communityService';

export interface DailyFeature {
  day:string;
  fighterName:string;
  stage:StageId;
  entry:{id:string;fighter_name:string;fighter_data:Record<string,unknown>;
    public_portrait_path:string|null;public_sheet_path:string|null};
}
export interface DailyState {
  available:boolean;
  feature:DailyFeature|null;
  myResult:{won:boolean;rounds_for:number;rounds_against:number}|null;
  monthWins:number;
  monthPlayed:number;
}
export const DAILY_MILESTONES:{wins:number;title:string}[]=[
  {wins:3,title:'CALENTANDO'},
  {wins:7,title:'CONSTANTE'},
  {wins:14,title:'VETERANO'},
  {wins:21,title:'IMPARABLE'},
  {wins:28,title:'LEYENDA DEL MES'},
];
export function dailyTitle(monthWins:number):string{
  let title='';
  for(const m of DAILY_MILESTONES)if(monthWins>=m.wins)title=m.title;
  return title;
}
export function nextMilestone(monthWins:number):{wins:number;title:string}|null{
  return DAILY_MILESTONES.find(m=>monthWins<m.wins)||null;
}

function db(){if(!supabase)throw new Error('Supabase no está configurado.');return supabase;}

export async function readDaily():Promise<DailyState>{
  const {data,error}=await db().rpc('pb_daily_today');
  if(error)throw new Error(error.message);
  if(!data?.available)return {available:false,feature:null,myResult:null,monthWins:0,monthPlayed:0};
  return {
    available:true,
    feature:{
      day:String(data.day),
      fighterName:String(data.fighter_name||'LUCHADOR'),
      stage:String(data.stage) as StageId,
      entry:{
        id:`daily_${data.day}`,
        fighter_name:String(data.fighter_name||'LUCHADOR'),
        fighter_data:(data.fighter_data||{}) as Record<string,unknown>,
        public_portrait_path:data.public_portrait_path||null,
        public_sheet_path:data.public_sheet_path||null,
      },
    },
    myResult:data.my_result?{won:Boolean(data.my_result.won),
      rounds_for:Number(data.my_result.rounds_for)||0,
      rounds_against:Number(data.my_result.rounds_against)||0}:null,
    monthWins:Number(data.month_wins)||0,
    monthPlayed:Number(data.month_played)||0,
  };
}

function readPublicImage(url:string):Promise<string>{
  return fetch(url,{mode:'cors'}).then(async response=>{
    if(!response.ok)throw new Error('No se pudo descargar la imagen del luchador del día.');
    const blob=await response.blob();
    if(!['image/png','image/jpeg','image/webp'].includes(blob.type)||blob.size>3_100_000)
      throw new Error('La imagen del luchador del día no tiene un formato admitido.');
    return new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result));
      reader.onerror=()=>reject(new Error('No se pudo leer la imagen del luchador del día.'));
      reader.readAsDataURL(blob);
    });
  });
}

/** Convierte el reto del día en un FighterProfile completo (arte público de comunidad). */
export async function loadDailyFighter(feature:DailyFeature):Promise<FighterProfile>{
  const {entry}=feature;
  if(!entry.public_portrait_path||!entry.public_sheet_path)
    throw new Error('El luchador del día no tiene sus imágenes públicas disponibles.');
  const [portraitDataUrl,spriteSheetDataUrl]=await Promise.all([
    readPublicImage(fighterPublicUrl(entry.public_portrait_path)),
    readPublicImage(fighterPublicUrl(entry.public_sheet_path)),
  ]);
  return {
    ...(entry.fighter_data as Omit<FighterProfile,'spriteSheetDataUrl'|'portraitDataUrl'>),
    id:`community_${entry.id}`,
    fighterName:entry.fighter_name,
    isPreset:false,
    portraitDataUrl,
    spriteSheetDataUrl,
  };
}

export async function recordDailyResult(won:boolean,roundsFor:number,roundsAgainst:number,fighterLocalId:string|null):
    Promise<{recorded:boolean;reason?:string;won:boolean;month_wins?:number}>{
  const {data,error}=await db().rpc('pb_daily_record',{
    p_won:won,p_rounds_for:roundsFor,p_rounds_against:roundsAgainst,p_fighter_local_id:fighterLocalId,
  });
  if(error)throw new Error(error.message);
  return data as {recorded:boolean;reason?:string;won:boolean;month_wins?:number};
}
