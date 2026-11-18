import React,{useEffect,useRef,useState} from 'react';
import type {CpuDifficulty,FighterProfile,GroupBattleMode,StageId} from '../types/fighter';
import type {InputState,EngineSnapshot,MoveSlot} from '../engine/FightEngine';
import {STAGE_WIDTH,STAGE_HEIGHT} from '../engine/FightEngine';
import {MultiFightEngine} from '../engine/MultiFightEngine';
import {MobileControls} from './MobileControls';
import {RematchRoster} from './RematchRoster';
import type {OnlineSession} from '../network/OnlineSession';
import type {NetworkState} from '../network/protocol';
import {Pause,Play,ArrowLeft,Volume2,VolumeX} from 'lucide-react';
import {soundFX} from '../engine/SoundFX';
import './fightArena.css';
import './groupFightArena.css';
const fixed=1000/60;
const blank=():InputState=>({left:false,right:false,up:false,down:false,guard:false,light:false,heavy:false,spNeutral:false,spForward:false,spUp:false,superBtn:false,romanCancel:false,dashLeft:false,dashRight:false});
const KEYS1:Record<string,keyof InputState>={KeyA:'left',KeyD:'right',KeyW:'up',KeyS:'down',KeyQ:'guard',KeyF:'light',KeyH:'heavy',KeyR:'spForward',KeyT:'spUp',KeyY:'superBtn'};
const KEYS2:Record<string,keyof InputState>={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',KeyN:'guard',KeyJ:'light',KeyL:'heavy',KeyU:'spForward',KeyI:'spUp',KeyO:'superBtn'};
interface Props{
  fighters:[FighterProfile,FighterProfile,FighterProfile,FighterProfile];
  roster:FighterProfile[]; battleMode:GroupBattleMode;stage:StageId;difficulty:CpuDifficulty;
  online?:OnlineSession;onExit:()=>void;
  onRematch:(fighters:FighterProfile[],stage?:StageId)=>void;
}
export function GroupFightArena({fighters,roster,battleMode,stage,difficulty,online,onExit,onRematch}:Props){
  const canvas=useRef<HTMLCanvasElement>(null),engineRef=useRef<MultiFightEngine|null>(null);
  const touch=useRef<InputState>(blank()),stopRef=useRef(false);
  const onlineMode=!!online;
  const mySeat=online?.slot??0;
  const [snapshot,setSnapshot]=useState<EngineSnapshot|null>(null);
  const [paused,setPaused]=useState(false);
  const [onlineIssue,setOnlineIssue]=useState('');
  const [requested,setRequested]=useState(false);
  const [votes,setVotes]=useState<boolean[]>([]);
  const [humanP2,setHumanP2]=useState(false);
  const humanP2Ref=useRef(false);
  useEffect(()=>{humanP2Ref.current=humanP2;if(engineRef.current)engineRef.current.localHumanSeats=humanP2?2:1;},[humanP2]);
  const [muted,setMuted]=useState(soundFX.muted);
  const [latency,setLatency]=useState<number|null>(null);
  const [settings,setSettings]=useState(()=>({
    fixed:localStorage.getItem('pb-stick-fixed')==='true',
    southpaw:localStorage.getItem('pb-southpaw')==='true',
    opacity:Math.max(35,Math.min(100,Number(localStorage.getItem('pb-control-opacity'))||80)),
  }));
  useEffect(()=>{stopRef.current=paused;touch.current=blank();if(paused)online?.neutral();},[paused,online]);
  useEffect(()=>{
    document.documentElement.classList.add('arena-touch-lock');
    return()=>document.documentElement.classList.remove('arena-touch-lock');
  },[]);
  useEffect(()=>{
    const eng=new MultiFightEngine(fighters,battleMode,stage,difficulty);
    eng.remoteHumanControls=onlineMode;
    eng.localHumanSeats=humanP2Ref.current?2:1;
    engineRef.current=eng;
    void eng.loadAssets();setSnapshot(eng.getSnapshot());
    const unsubscribe=online?[online.on('state',(state:NetworkState)=>{eng.applyNetworkState(state);setSnapshot(state.snapshot);}),
      online.on('connection',(ev:{reconnecting?:boolean;opponent?:boolean})=>setOnlineIssue(ev.reconnecting?'RECONEXIÓN EN CURSO…':'')),
      online.on('opponent_left',()=>setOnlineIssue('OTRO JUGADOR HA ABANDONADO LA SALA')),
      online.on('rematch',(event:{stage?:StageId;fighters?:FighterProfile[]})=>{
        if(event.fighters?.length===4)onRematch(event.fighters,event.stage);
      }),
      online.on('rematch_vote',(msg:{votes?:boolean[]})=>setVotes(msg.votes||[]))]:[];
    const canvasEl=canvas.current;
    const size=()=>{if(!canvasEl)return;const dpr=Math.min(2,window.devicePixelRatio||1);
      canvasEl.width=Math.round(STAGE_WIDTH*dpr);canvasEl.height=Math.round(STAGE_HEIGHT*dpr);};
    size();window.addEventListener('resize',size);
    const k1=blank(),k2=blank();
    const keydown=(e:KeyboardEvent)=>{
      if(e.code==='Escape'&&!e.repeat){e.preventDefault();setPaused(v=>!v);return;}
      const key1=KEYS1[e.code],key2=KEYS2[e.code];
      if(key1||(!onlineMode&&humanP2Ref.current&&key2))e.preventDefault();
      if(key1){k1[key1]=true;
        if(onlineMode && !e.repeat){const slot=key1==='light'?'LIGHT':key1==='heavy'?'HEAVY':key1==='spForward'?'SP_FORWARD':key1==='spUp'?'SP_UP':key1==='superBtn'?'SUPER':null;
          if(slot)online?.sendAction(slot as MoveSlot);
          if(key1==='up')online?.sendJump();
        }
      }
      if(!onlineMode&&humanP2Ref.current&&key2)k2[key2]=true;
      if(e.code==='KeyG'&&!e.repeat){if(onlineMode)online?.sendAction(k1.up?'SP_UP':k1.left||k1.right?'SP_FORWARD':'SP_NEUTRAL');
        else eng.queueTouchAction(k1.up?'SP_UP':k1.left||k1.right?'SP_FORWARD':'SP_NEUTRAL');}
      if(!onlineMode&&humanP2Ref.current&&e.code==='KeyK'&&!e.repeat)eng.queueNetworkAction(1,k2.up?'SP_UP':k2.left||k2.right?'SP_FORWARD':'SP_NEUTRAL');
    };
    const keyup=(e:KeyboardEvent)=>{const key1=KEYS1[e.code],key2=KEYS2[e.code];if(key1)k1[key1]=false;if(key2)k2[key2]=false;};
    const clear=()=>{Object.assign(k1,blank());Object.assign(k2,blank());touch.current=blank();online?.neutral();};
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);
    window.addEventListener('blur',clear);
    const ping=online?setInterval(()=>{online.keepAlive();setLatency(online.latency);},4000):null;
    let last=performance.now(),accumulator=0,frame=0,raf=0;
    const loop=(now:number)=>{
      accumulator+=Math.min(100,now-last);last=now;
      while(accumulator>=fixed){accumulator-=fixed;
        if(!stopRef.current){
          const p1=blank();for(const key of Object.keys(p1) as (keyof InputState)[])p1[key]=!!(k1[key]||touch.current[key]);
          if(onlineMode){
            for(const key of ['light','heavy','spNeutral','spForward','spUp','superBtn'] as (keyof InputState)[])p1[key]=false;
            online?.sendControls(p1);
          }else{
            eng.localHumanSeats=humanP2Ref.current?2:1;
            eng.setSeatInput(0,p1);
            if(humanP2Ref.current)eng.setSeatInput(1,k2);
            eng.step();
          }
          if(++frame%2===0&&!onlineMode)setSnapshot(eng.getSnapshot());
        }
      }
      const ctx=canvasEl?.getContext('2d');if(ctx&&canvasEl){
        const scale=canvasEl.width/STAGE_WIDTH;ctx.setTransform(scale,0,0,scale,0,0);eng.render(ctx);
      }
      raf=requestAnimationFrame(loop);
    };
    raf=requestAnimationFrame(loop);
    return()=>{cancelAnimationFrame(raf);unsubscribe.forEach(off=>off());if(ping)clearInterval(ping);
      window.removeEventListener('resize',size);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);
      window.removeEventListener('blur',clear);clear();};
  },[fighters,battleMode,stage,difficulty,online,onRematch]);
  const summary=snapshot?.multi;
  const myPlayer=summary?.players[mySeat];
  const goRematch=(profiles:FighterProfile[])=>{
    if(online){online.requestRematch(profiles[mySeat]);setRequested(true);}
    else onRematch(profiles);
  };
  return <main className="pb-group-screen">
    <header className="pb-group-hud">
      <div className="pb-group-hud-grid">{fighters.map((f,i)=>{
        const info=summary?.players[i];const own=online?i===mySeat:i===0||humanP2&&i===1;
        return <div className={`pb-group-player ${battleMode==='2V2'?(i%2===0?'team-red':'team-blue'):''} ${info?.eliminated?'is-eliminated':''}`} key={i}>
          <img src={f.portraitDataUrl} alt=""/><div><strong>{own?'★ ':''}{f.fighterName}</strong>
          <div className="pb-group-hp"><i style={{width:`${info?Math.max(0,100*info.hp/info.maxHp):100}%`}}/></div>
          <small>{info?.eliminated?'ELIMINADO':`♥ ${info?.stocks??3} · KO ${info?.kos??0}`}</small></div>
        </div>;
      })}</div>
      <div className="pb-group-time"><strong>{summary?.timeRemaining??240}s</strong><span>{battleMode==='2V2'?'2 VS 2':'FREE FOR ALL'}</span>
        <button type="button" onClick={()=>setPaused(true)} aria-label="Pausar"><Pause size={16}/></button></div>
    </header>
    <div className="pb-group-stage"><canvas ref={canvas} width={STAGE_WIDTH} height={STAGE_HEIGHT}/>
      {online&&<span className="pb-group-ping" aria-label="Latencia online">{latency===null?'●':`${latency} ms`}</span>}
      {onlineIssue&&<div className="pb-group-disconnect">{onlineIssue}<button type="button" onClick={onExit}>SALIR</button></div>}
    </div>
    {!snapshot?.roundOver&&<div className="pb-group-touch"><MobileControls inputRef={touch} superReady={(myPlayer?.meter??0)>=100}
      fixedStick={settings.fixed} southpaw={settings.southpaw} opacity={settings.opacity}
      comboStep={0} isFinisherReady={()=>false}
      getFacing={()=>engineRef.current?.getFighters()[mySeat]?.facing||1}
      onAction={slot=>{if(online)online.sendAction(slot);else engineRef.current?.queueTouchAction(slot);}}
      onDash={dir=>{if(online)online.sendDash(dir);else engineRef.current?.queueTouchDash(dir);}}
      onJump={()=>{if(online)online.sendJump();else engineRef.current?.queueTouchJump();}}/></div>}
    {!snapshot?.roundOver&&paused&&<div className="pb-group-pause"><section>
      <h2>PAUSA</h2><p>{online?'El combate online continúa en el servidor.':'Combate detenido.'}</p>
      <button type="button" onClick={()=>setPaused(false)}><Play size={15}/> VOLVER</button>
      {!online&&<button type="button" onClick={()=>setHumanP2(v=>!v)}>P2 LOCAL: {humanP2?'ACTIVO':'CPU'}</button>}
      <button type="button" onClick={()=>{soundFX.muted=!soundFX.muted;setMuted(soundFX.muted);}}>{muted?<VolumeX size={15}/>:<Volume2 size={15}/>} SONIDO {muted?'OFF':'ON'}</button>
      <button type="button" onClick={onExit}><ArrowLeft size={15}/> SALIR</button>
    </section></div>}
    {snapshot?.roundOver&&<div className="pb-group-result-overlay"><RematchRoster players={fighters} roster={roster}
      selectableSeats={online?[mySeat]:[0,1,2,3]}
      onRematch={goRematch} onExit={onExit} requested={requested} votes={votes}
      labels={fighters.map((_,i)=>battleMode==='2V2'?`P${i+1} · ${i%2===0?'ROJO':'AZUL'}`:`JUGADOR ${i+1}`)}
      title={summary?.isDraw?'EMPATE':summary?.winningTeam?`GANA EQUIPO ${summary.winningTeam==='RED'?'ROJO':'AZUL'}`:
        summary?.winnerSeat!=null?`GANA ${fighters[summary.winnerSeat].fighterName}`:'FIN DEL COMBATE'}
      detail={<div className="pb-group-score"><span>{summary?.reason==='TIME'?'FIN DEL TIEMPO':'VICTORIA POR KO'}</span>
        {battleMode==='2V2'&&<strong className="pb-group-team-score">ROJO {summary?.teamKOs[0]??0} KO · AZUL {summary?.teamKOs[1]??0} KO</strong>}
        <div>{summary?.players.map(p=><small key={p.seat}>P{p.seat+1}: {p.kos} KO · {p.assists} ASIST. · {p.deaths} CAÍDAS · {p.stocks} VIDAS · {Math.round(p.damageDealt)} DAÑO</small>)}</div></div>}/></div>}
  </main>;
}
