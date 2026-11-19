/** V56 · Red social ligera. Los permisos y comprobaciones viven en RPC / RLS de Supabase. */
import {supabase} from './supabaseClient';

export type SocialMode='1V1'|'2V2'|'FREE_FOR_ALL';
export type PublicFriend={id:string;username:string;display_name:string;favorite_avatar_path:string|null};
export type Friendship={user_a:string;user_b:string;requested_by:string;status:'pending'|'accepted';created_at:string};
export type GameInvitation={id:string;inviter_id:string;invitee_id:string;room_code:string;battle_mode:SocialMode;ranked:boolean;status:'pending'|'accepted'|'declined'|'cancelled';created_at:string;expires_at:string};
export type SocialSnapshot={friends:PublicFriend[];incoming:PublicFriend[];outgoing:PublicFriend[];invitations:(GameInvitation&{sender:PublicFriend})[];sent:GameInvitation[]};
const emptyProfile=(id:string):PublicFriend=>({id,username:'jugador',display_name:'JUGADOR',favorite_avatar_path:null});
function db(){if(!supabase)throw new Error('Supabase no está configurado.');return supabase;}
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
 const {data,error}=await db().rpc(name,args);if(error)throw new Error(error.message);return data as T;
}
export async function readSocial(myId:string):Promise<SocialSnapshot>{
 const client=db();
 // El identificador procede de la sesión comprobada por App. Las tablas tienen RLS por usuario.
 const [f,i]=await Promise.all([
  client.from('pb_friendships').select('user_a,user_b,requested_by,status,created_at').or(`user_a.eq.${myId},user_b.eq.${myId}`).limit(300),
  client.from('pb_game_invitations').select('id,inviter_id,invitee_id,room_code,battle_mode,ranked,status,created_at,expires_at')
    .or(`inviter_id.eq.${myId},invitee_id.eq.${myId}`).order('created_at',{ascending:false}).limit(75),
 ]);
 if(f.error)throw new Error(f.error.message);if(i.error)throw new Error(i.error.message);
 const relationships=(f.data||[]) as Friendship[];
 const invites=(i.data||[]) as GameInvitation[];
 const others=[...new Set([...relationships.map(r=>r.user_a===myId?r.user_b:r.user_a),...invites.map(x=>x.inviter_id===myId?x.invitee_id:x.inviter_id)])].filter(id=>id!==myId);
 const result=others.length?await client.from('player_profiles').select('id,username,display_name,favorite_avatar_path').in('id',others):{data:[],error:null};
 if(result.error)throw new Error(result.error.message);
 const profiles=new Map(((result.data||[]) as PublicFriend[]).map(p=>[p.id,p]));
 const profile=(id:string)=>profiles.get(id)||emptyProfile(id);
 const friends:PublicFriend[]=[],incoming:PublicFriend[]=[],outgoing:PublicFriend[]=[];
 for(const r of relationships){const other=r.user_a===myId?r.user_b:r.user_a;
  if(r.status==='accepted')friends.push(profile(other));
  else (r.requested_by===myId?outgoing:incoming).push(profile(other));
 }
 const expiry=Date.now();
 const invitations=invites.filter(x=>x.invitee_id===myId&&x.status==='pending'&&Date.parse(x.expires_at)>expiry)
  .map(x=>({...x,sender:profile(x.inviter_id)}));
 const sent=invites.filter(x=>x.inviter_id===myId&&x.status==='pending'&&Date.parse(x.expires_at)>expiry);
 const alpha=(a:PublicFriend,b:PublicFriend)=>a.username.localeCompare(b.username);
 return {friends:friends.sort(alpha),incoming:incoming.sort(alpha),outgoing:outgoing.sort(alpha),invitations,sent};
}
export const sendFriendRequest=(username:string)=>rpc<string>('pb_friend_request',{p_username:username.trim().toLowerCase()});
export const replyFriend=(id:string,accept:boolean)=>rpc<void>('pb_friend_reply',{p_other:id,p_accept:accept});
export const removeFriend=(id:string)=>rpc<void>('pb_friend_remove',{p_other:id});
export const sendGameInvitation=(invitee:string,code:string,mode:SocialMode,ranked:boolean)=>rpc<string>('pb_invitation_send',{
 p_invitee:invitee,p_room_code:code,p_battle_mode:mode,p_ranked:ranked,
});
export const replyGameInvitation=(id:string,accept:boolean)=>rpc<void>('pb_invitation_reply',{p_invitation:id,p_accept:accept});
export const cancelGameInvitation=(id:string)=>rpc<void>('pb_invitation_cancel',{p_invitation:id});
