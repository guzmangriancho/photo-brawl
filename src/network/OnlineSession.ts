import type { FighterProfile, StageId, GroupBattleMode } from '../types/fighter';
import type { InputState, MoveSlot } from '../engine/FightEngine';
import { packControls } from './protocol';
import { getOnlineAccessToken } from '../services/supabaseClient';
import type { NetworkState, OnlineStart, PlayerRole, RemoteAction, RoomView } from './protocol';

const SESSION_KEY = 'pb-online-reconnect-v2';
const SAVED_MAX_AGE=3*60_000; // Server grace is 90s by default.
const RETRY_MAX_AGE=85_000;
type SavedSession={code:string;token:string;savedAt:number};
let activeRestore: Promise<OnlineSession | null> | null = null;
export type SessionEvent = 'room'|'start'|'state'|'connection'|'error'|'opponent_left'|'rematch'|'rematch_vote'|'ranked_result';
type Listener = (value: any) => void;
function endpoint(): string {
  const configured = (import.meta.env.VITE_ONLINE_WS_URL as string | undefined)?.trim();
  if(configured){
    if(!/^wss?:\/\//i.test(configured)) throw new Error('VITE_ONLINE_WS_URL debe comenzar por ws:// o wss://.');
    if(location.protocol==='https:' && !configured.startsWith('wss://'))
      throw new Error('El online necesita wss:// cuando el juego se sirve por HTTPS.');
    return configured;
  }
  if (location.protocol === 'https:') throw new Error('Servidor online sin configurar: define VITE_ONLINE_WS_URL=wss://TU-BACKEND.onrender.com/ws en Vercel y vuelve a desplegar.');
  // Dev: Vite proxies /ws to the Node combat server. The browser only connects
  // to the same host/port used to open the game, avoiding LAN firewall/origin issues.
  return `ws://${location.host}/ws`;
}
export class OnlineSession {
  private ws: WebSocket | null = null;
  private listeners = new Map<SessionEvent,Set<Listener>>();
  private intentionalClose = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private lastInputMask = -1;
  private lastInputAt = 0;
  private queuedActions: RemoteAction[] = [];
  private sequence = 0;
  private disconnectedAt = 0;
  public room: RoomView | null = null;
  public state: NetworkState | null = null;
  public match: OnlineStart | null = null;
  public connected = false;
  public reconnecting = false;
  public error = '';
  public role: PlayerRole | null = null;
  public slot = 0;
  public code = '';
  public token = '';
  public latency: number | null = null;

  on(event:SessionEvent,fn:Listener):()=>void {
    const set=this.listeners.get(event)||new Set();set.add(fn);this.listeners.set(event,set);
    if(event==='room'&&this.room)fn(this.room);
    if(event==='state'&&this.state)fn(this.state);
    if(event==='start'&&this.match)fn(this.match);
    if(event==='connection')fn({connected:this.connected,reconnecting:this.reconnecting});
    if(event==='error'&&this.error)fn(this.error);
    return()=>set.delete(fn);
  }
  private emit(event:SessionEvent,value:any){this.listeners.get(event)?.forEach(fn=>fn(value));}
  private send(obj:Record<string,unknown>){if(this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify(obj));}
  private save(){
    const value=JSON.stringify({code:this.code,token:this.token,savedAt:Date.now()});
    try{sessionStorage.setItem(SESSION_KEY,value);}catch{}
    // Android/iOS can kill the PWA tab while Gemini is open. Local backup makes a
    // subsequent app launch resumable within the server's short grace period.
    try{localStorage.setItem(SESSION_KEY,value);}catch{}
  }
  private clearSaved(){
    try{sessionStorage.removeItem(SESSION_KEY);}catch{}
    try{localStorage.removeItem(SESSION_KEY);}catch{}
  }
  private static readSaved():SavedSession|null {
    for(const kind of ['session','local'] as const){
      try{
        const storage=kind==='session'?sessionStorage:localStorage;
        const saved=JSON.parse(storage.getItem(SESSION_KEY)||'null') as SavedSession|null;
        if(saved && /^[A-Z2-9]{6}$/.test(saved.code) && /^[a-f0-9]{48}$/.test(saved.token)
           && Number.isFinite(saved.savedAt) && Date.now()-saved.savedAt<SAVED_MAX_AGE) return saved;
      }catch{}
    }
    return null;
  }
  private connect(initial:Record<string,unknown>):Promise<void> {
    return new Promise((resolve,reject)=>{
      let ws:WebSocket;
      try{ws=new WebSocket(endpoint());}catch(e){reject(e);return;}
      this.ws=ws;
      let welcomed=false,settled=false;
      const failed=(message:string)=>{
        if(settled)return;
        settled=true;clearTimeout(errorTimeout);
        reject(new Error(message));
      };
      const errorTimeout=setTimeout(()=>{
        if(!welcomed){
          failed('El servidor online no responde. Comprueba que está arrancado.');
          ws.close();
        }
      },7000);
      ws.onopen=()=>{
        this.send(this.token?{type:'resume',code:this.code,token:this.token}:initial);
      };
      ws.onmessage=(ev)=>{
        let msg:any;try{msg=JSON.parse(String(ev.data));}catch{return;}
        if(msg.type==='welcome'){
          this.code=msg.code;this.role=msg.role;this.slot=typeof msg.slot==='number'?msg.slot:(msg.role==='guest'?1:0);this.token=msg.token;this.save();
          welcomed=true;this.retries=0;this.disconnectedAt=0;
          this.connected=true;this.reconnecting=false;this.error='';
          this.lastInputMask=0;this.sequence=0;this.queuedActions=[];
          this.emit('connection',{connected:true,reconnecting:false});
          if(!settled){settled=true;clearTimeout(errorTimeout);resolve();}
        }else if(msg.type==='room'){
          this.room=msg.room;
          if(typeof msg.room?.slot==='number')this.slot=msg.room.slot;this.emit('room',this.room);
        }else if(msg.type==='start'){
          this.match={code:msg.code,role:this.role||'host',p1:msg.p1,p2:msg.p2,stage:msg.stage,battleMode:msg.battleMode,fighters:msg.fighters,slot:this.slot};
          this.emit('start',this.match);
        }else if(msg.type==='state'){
          this.state=msg.state;this.emit('state',msg.state);
        }else if(msg.type==='error'){
          this.error=String(msg.message||'Error online');this.emit('error',this.error);
          if(!welcomed){
            failed(this.error);
            this.clearSaved();this.token='';
            ws.close();
          }
        }else if(msg.type==='interrupted'){
          this.emit('connection',{connected:true,reconnecting:true,opponent:true});
        }else if(msg.type==='resumed'){
          this.emit('connection',{connected:true,reconnecting:false});
        }else if(msg.type==='rematch'){
          this.state=null;
          if(this.match)this.match={...this.match,stage:typeof msg.stage==='string'?msg.stage as StageId:this.match.stage,
            p1:msg.p1||msg.fighters?.[0]||this.match.p1,p2:msg.p2||msg.fighters?.[1]||this.match.p2,
            fighters:msg.fighters||this.match.fighters};
          this.emit('rematch',{stage:typeof msg.stage==='string'?msg.stage:undefined,p1:msg.p1,p2:msg.p2,fighters:msg.fighters});
        }else if(msg.type==='rematch_vote'){
          this.emit('rematch_vote',{host:msg.host,guest:msg.guest,votes:msg.votes,fighters:msg.fighters});
        }else if(msg.type==='ranked_result'){
          this.emit('ranked_result',msg.result);
        }else if(msg.type==='opponent_left'||msg.type==='closed'){
          this.emit('opponent_left',null);this.clearSaved();this.intentionalClose=true;
          ws.close();
        }else if(msg.type==='pong'&&typeof msg.t==='number'){
          this.latency=Math.max(0,Date.now()-msg.t);
        }
      };
      ws.onerror=()=>{
        if(!welcomed)failed('No se pudo conectar al servidor online.');
      };
      ws.onclose=()=>{
        clearTimeout(errorTimeout);
        if(this.ws!==ws)return;
        this.connected=false;
        if(!welcomed)failed('Servidor online no disponible.');
        if(this.intentionalClose)return;
        if(!this.disconnectedAt)this.disconnectedAt=Date.now();
        this.reconnecting=true;
        this.emit('connection',{connected:false,reconnecting:true});
        if(this.token && Date.now()-this.disconnectedAt<RETRY_MAX_AGE){
          const delay=Math.min(4500,450+this.retries*550);this.retries++;
          this.retryTimer=setTimeout(()=>{
            if(!this.intentionalClose)void this.connect({type:'resume',code:this.code,token:this.token}).catch(()=>{});
            // Failed handshakes schedule another try from ws.onclose.
          },delay);
        }else{
          this.error='Se agotó el tiempo de reconexión. Crea otra sala desde el menú.';
          this.clearSaved();this.intentionalClose=true;
          this.emit('error',this.error);
          this.emit('opponent_left',null);
        }
      };
    });
  }
  static async create(profile:FighterProfile,stage:StageId,ranked=false,battleMode?:GroupBattleMode):Promise<OnlineSession>{
    const accessToken=ranked?await getOnlineAccessToken():null;
    if(ranked&&!accessToken)throw new Error('Inicia sesión en CUENTA para crear una sala clasificatoria.');
    if(battleMode&&ranked)throw new Error('El 2v2 y FFA no son clasificatorios.');
    const s=new OnlineSession();await s.connect({type:'create',profile,stage,ranked,accessToken,battleMode});return s;
  }
  static async join(code:string,profile:FighterProfile):Promise<OnlineSession>{
    const accessToken=await getOnlineAccessToken();
    const s=new OnlineSession();await s.connect({type:'join',code:code.trim().toUpperCase(),profile,accessToken});return s;
  }
  // React StrictMode may run mount effects twice. Reuse one handshake instead of
  // opening two connections and inadvertently invalidating the first socket.
  static restore():Promise<OnlineSession|null>{
    if(activeRestore)return activeRestore;
    activeRestore=(async()=>{
      const saved=OnlineSession.readSaved();
      if(!saved?.code||!saved?.token)return null;
      const s=new OnlineSession();s.code=saved.code;s.token=saved.token;
      try{await s.connect({type:'resume',code:s.code,token:s.token});return s;}
      catch{
        // A temporarily offline server must not wipe the resume token.
        s.intentionalClose=true;s.ws?.close();return null;
      }
    })();
    activeRestore.finally(()=>{activeRestore=null;});
    return activeRestore;
  }
  swapTeams(a:number,b:number){this.send({type:'swap_seats',a,b});}
  choose(profile:FighterProfile){this.send({type:'choose',profile});}
  stage(stage:StageId|'RANDOM'){this.send({type:'stage',stage});}
  ready(value:boolean){this.send({type:'ready',ready:value});}
  start(){this.send({type:'start'});}
  requestRematch(profile?:FighterProfile){this.send({type:'rematch',profile});}
  sendAction(slot:MoveSlot){if(!this.connected)return;this.queuedActions.push({kind:'move',slot});this.flush();}
  sendJump(){if(!this.connected)return;this.queuedActions.push({kind:'jump'});this.flush();}
  sendDash(dir:-1|1){if(!this.connected)return;this.queuedActions.push({kind:'dash',dir});this.flush();}
  sendControls(input:InputState,force=false){
    const mask=packControls(input);
    const now=performance.now();
    if(!force&&mask===this.lastInputMask&&now-this.lastInputAt<120)return;
    this.lastInputMask=mask;this.lastInputAt=now;
    if(this.connected)this.send({type:'input',seq:++this.sequence,mask,actions:[]});
  }
  private flush(){
    if(!this.connected)return;
    const actions=this.queuedActions.splice(0,6);
    this.send({type:'input',seq:++this.sequence,mask:Math.max(0,this.lastInputMask),actions});
  }
  keepAlive(){if(this.connected)this.send({type:'ping',t:Date.now()});}
  neutral(){this.queuedActions=[];this.lastInputMask=0;this.send({type:'input',seq:++this.sequence,mask:0,actions:[]});}
  close(){
    this.intentionalClose=true;
    if(this.retryTimer)clearTimeout(this.retryTimer);
    this.neutral();this.send({type:'leave'});
    this.ws?.close();this.ws=null;
    this.clearSaved();this.connected=false;
  }
}
