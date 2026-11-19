import {supabase} from './supabaseClient';

export type HeadToHeadMatch={
  match_id:string;played_at:string;mode:'1V1'|'2V2'|'FREE_FOR_ALL';
  result:'VICTORIA'|'DERROTA'|'EMPATE';my_fighter:string|null;other_fighter:string|null;
};

/** Supabase SECURITY DEFINER RPC applies auth.uid() and pair-only filters. */
export async function headToHead(opponentId:string):Promise<HeadToHeadMatch[]>{
  if(!supabase)throw new Error('Supabase no está configurado.');
  const {data,error}=await supabase.rpc('pb_head_to_head',{p_other:opponentId});
  if(error)throw new Error('No se pudo cargar el historial. Comprueba la migración V55.');
  return (data||[]) as HeadToHeadMatch[];
}
