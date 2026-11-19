/** V51 - Visual progression is READ-ONLY in the browser. Only Render's authenticated
 * authoritative match server can award trophies through service_role RPCs. */
import {supabase} from './supabaseClient';

export const LEAGUES=[
  {key:'BRONCE',min:0,next:100,label:'BRONCE'},
  {key:'PLATA',min:100,next:300,label:'PLATA'},
  {key:'ORO',min:300,next:600,label:'ORO'},
  {key:'DIAMANTE',min:600,next:1000,label:'DIAMANTE'},
  {key:'MAESTRO',min:1000,next:1600,label:'MAESTRO'},
  {key:'LEYENDA',min:1600,next:null,label:'LEYENDA'},
] as const;
export type LeagueKey=typeof LEAGUES[number]['key'];
export function leagueFor(trophies:number):typeof LEAGUES[number] {
  const safe=Number.isFinite(trophies)?Math.max(0,trophies):0;
  return [...LEAGUES].reverse().find(league=>safe>=league.min)||LEAGUES[0];
}
export function leagueProgress(trophies:number):number{
  const league=leagueFor(trophies);
  return league.next===null?1:Math.max(0,Math.min(1,(trophies-league.min)/(league.next-league.min)));
}

export interface FighterRank{
  fighter_id:string;account_id:string;trophies:number;best_trophies:number;
  wins:number;losses:number;played:number;
  fighters:{fighter_name:string;owner_id:string;local_id:string;is_public:boolean;
    public_portrait_path:string|null;
    player_profiles:{display_name:string;username:string}|null};
}
export interface DuoRank{
  player_a:string;player_b:string;trophies:number;best_trophies:number;
  wins:number;losses:number;played:number;
  a:{display_name:string;username:string;favorite_avatar_path:string|null}|null;
  b:{display_name:string;username:string;favorite_avatar_path:string|null}|null;
}

function db(){if(!supabase)throw new Error('Supabase no está configurado.');return supabase;}
/** Public leaderboard never fetches a private fighter portrait or its fighter_data. */
export async function fighterLeaderboard():Promise<FighterRank[]>{
  const {data,error}=await db().from('fighter_progress')
    .select('fighter_id,account_id,trophies,best_trophies,wins,losses,played,fighters!inner(fighter_name,owner_id,local_id,is_public,public_portrait_path,player_profiles!fighters_owner_id_fkey(display_name,username))')
    .eq('fighters.is_public',true).gt('played',0)
    .order('trophies',{ascending:false}).order('wins',{ascending:false}).limit(50);
  if(error)throw error;
  return (data||[]) as unknown as FighterRank[];
}
export async function duoLeaderboard():Promise<DuoRank[]>{
  const {data,error}=await db().from('duo_progress')
    .select('player_a,player_b,trophies,best_trophies,wins,losses,played,a:player_profiles!duo_progress_player_a_fkey(display_name,username,favorite_avatar_path),b:player_profiles!duo_progress_player_b_fkey(display_name,username,favorite_avatar_path)')
    .gt('played',0).order('trophies',{ascending:false}).order('wins',{ascending:false}).limit(50);
  if(error)throw error;
  return (data||[]) as unknown as DuoRank[];
}

/** Ranking shown for owned fighters including those still kept private. */
export async function ownFighterRanks():Promise<Record<string,{trophies:number;league:LeagueKey}>>{
  const {data:{user},error:authError}=await db().auth.getUser();
  if(authError)throw authError;
  if(!user)return {};
  const {data,error}=await db().from('fighter_progress')
    .select('trophies,fighters!inner(local_id,owner_id)')
    .eq('account_id',user.id).eq('fighters.owner_id',user.id);
  if(error)throw error;
  const ranks:Record<string,{trophies:number;league:LeagueKey}>={};
  for(const row of data||[]){
    const fighter=row.fighters as unknown as {local_id:string}|null;
    if(fighter?.local_id)ranks[fighter.local_id]={trophies:row.trophies,league:leagueFor(row.trophies).key};
  }
  return ranks;
}

/** Small public metadata lookup, never includes private art or fighter definitions. */
export async function fighterCupsById(ids:string[]):Promise<Record<string,number>>{
  if(!ids.length)return {};
  const {data,error}=await db().from('fighter_progress').select('fighter_id,trophies').in('fighter_id',ids.slice(0,70));
  if(error)throw error;
  return Object.fromEntries((data||[]).map(row=>[row.fighter_id,row.trophies]));
}
