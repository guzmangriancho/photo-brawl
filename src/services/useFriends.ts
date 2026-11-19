import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from './supabaseClient';
import {readSocial,type SocialSnapshot} from './friendsService';
const blank:SocialSnapshot={friends:[],incoming:[],outgoing:[],invitations:[],sent:[]};
/** Realtime avisos con alternativa por polling/focus (invitaciones recibidas estando offline). */
export function useFriends(userId:string|undefined){
 const [data,setData]=useState<SocialSnapshot>(blank);
 const [error,setError]=useState('');
 const sequence=useRef(0);
 const refresh=useCallback(async()=>{
  if(!userId){setData(blank);setError('');return;}
  const rev=++sequence.current;
  try{const next=await readSocial(userId);if(rev===sequence.current){setData(next);setError('');}}
  catch(e){if(rev===sequence.current)setError(e instanceof Error?e.message:'No se pudo actualizar amigos.');}
 },[userId]);
 useEffect(()=>{
  if(!userId||!supabase){setData(blank);return;}
  const client=supabase;
  void refresh();
  const timer=setInterval(()=>{void refresh();},12000);
  const focus=()=>{void refresh();};window.addEventListener('focus',focus);
  const channel=client.channel(`pb-social-${userId}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'pb_friendships',filter:`user_a=eq.${userId}`},focus)
   .on('postgres_changes',{event:'*',schema:'public',table:'pb_friendships',filter:`user_b=eq.${userId}`},focus)
   .on('postgres_changes',{event:'*',schema:'public',table:'pb_game_invitations',filter:`invitee_id=eq.${userId}`},focus)
   .on('postgres_changes',{event:'*',schema:'public',table:'pb_game_invitations',filter:`inviter_id=eq.${userId}`},focus)
   .subscribe();
  return()=>{sequence.current++;clearInterval(timer);window.removeEventListener('focus',focus);void client.removeChannel(channel);};
 },[userId,refresh]);
 return {social:data,socialError:error,refreshSocial:refresh};
}
