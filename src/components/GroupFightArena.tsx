import React,{useEffect,useRef,useState} from 'react';
import type {CpuDifficulty,FighterProfile,GroupBattleMode,StageId} from '../types/fighter';
import type {InputState,EngineSnapshot,MoveSlot} from '../engine/FightEngine';
import {STAGE_WIDTH,STAGE_HEIGHT} from '../engine/FightEngine';
import {MultiFightEngine} from '../engine/MultiFightEngine';
import {MobileControls} from './MobileControls';
import {RematchRoster} from './RematchRoster';
import {VersusIntro} from './VersusIntro';
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
// Sixteen square pixels, ordered clockwise: each filled tile represents 1/16 of SUPER.
// Rendering them as a ring keeps the original 16-bit HUD language without another bar.
const SUPER_RING_TILES = [
  [1,1],[1,2],[1,3],[1,4],[1,5],
  [2,5],[3,5],[4,5],[5,5],
  [5,4],[5,3],[5,2],[5,1],
  [4,1],[3,1],[2,1],
] as const;
const matchClock=(seconds:number)=>{
  const remaining=Math.max(0,Math.ceil(seconds));
  return `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
};

interface Props{
  fighters:[FighterProfile,FighterProfile,FighterProfile,FighterProfile];
  roster:FighterProfile[]; battleMode:GroupBattleMode;stage:StageId;difficulty:CpuDifficulty;
  online?:OnlineSession;rankTrophies?:number[];onExit:()=>void;
  onRematch:(fighters:FighterProfile[],stage?:StageId)=>void;
}
export function GroupFightArena({fighters,roster,battleMode,stage,difficulty,online,rankTrophies,onExit,onRematch}:Props){
  const canvas=useRef<HTMLCanvasElement>(null),engineRef=useRef<MultiFightEngine|null>(null);
  const touch=useRef<InputState>(blank()),stopRef=useRef(false);
  const onlineMode=!!online;
  const mySeat=online?.slot??0;
  const [snapshot,setSnapshot]=useState<EngineSnapshot|null>(null);
  const [paused,setPaused]=useState(false);
  const [onlineIssue,setOnlineIssue]=useState('');
  const [requested,setRequested]=useState(false);
  const [votes,setVotes]=useState<boolean[]>([]);
  const [groupRating,setGroupRating]=useState<{
    recorded?:boolean;reason?:string;
    players?:{seat:number;old_rating:number;new_rating:number;delta:number;place:number}[];
    fighters?:{seat:number;before:number;after:number;change:number;rotation_bonus:number;league:string}[];
    duos?:{team:string;before:number;after:number;change:number;league:string}[];
  }|null>(null);
  const [humanP2,setHumanP2]=useState(false);
  const humanP2Ref=useRef(false);
  useEffect(()=>{humanP2Ref.current=humanP2;if(engineRef.current)engineRef.current.localHumanSeats=humanP2?2:1;},[humanP2]);
  const [muted,setMuted]=useState(soundFX.muted);
  const [resultVisible,setResultVisible]=useState(false);
  const [koToast,setKoToast]=useState<{frame:number;seat:number;eliminated:boolean}|null>(null);
  const [latency,setLatency]=useState<number|null>(null);
  const [settings,setSettings]=useState(()=>({
    fixed:localStorage.getItem('pb-stick-fixed')==='true',
    southpaw:localStorage.getItem('pb-southpaw')==='true',
    opacity:Math.max(35,Math.min(100,Number(localStorage.getItem('pb-control-opacity'))||80)),
  }));
  useEffect(()=>{
    if(!snapshot?.roundOver){setResultVisible(false);return;}
    const timer=window.setTimeout(()=>setResultVisible(true),1450);
    return()=>window.clearTimeout(timer);
  },[snapshot?.roundOver]);
  const lastToastFrame=useRef(-1);
  useEffect(()=>{
    const hit=snapshot?.multi?.lastKnockout;
    if(!hit||lastToastFrame.current===hit.frame)return;
    lastToastFrame.current=hit.frame;
    setKoToast({frame:hit.frame,seat:hit.loserSeat,eliminated:hit.eliminated});
    const timer=window.setTimeout(()=>setKoToast(v=>v?.frame===hit.frame?null:v),850);
    return()=>window.clearTimeout(timer);
  },[snapshot?.multi?.lastKnockout?.frame]);
  useEffect(()=>{stopRef.current=paused;touch.current=blank();if(paused)online?.neutral();},[paused,online]);
  useEffect(()=>{
    document.documentElement.classList.add('arena-touch-lock');
    return()=>document.documentElement.classList.remove('arena-touch-lock');
  },[]);
  useEffect(()=>{
    soundFX.setCrowdedCombat(true);
    const eng=new MultiFightEngine(fighters,battleMode,stage,difficulty);
    eng.beginVersusIntro();
    eng.remoteHumanControls=onlineMode;
    eng.localHumanSeats=humanP2Ref.current?2:1;
    eng.viewerSeat=mySeat;
    engineRef.current=eng;
    void eng.loadAssets();setSnapshot(eng.getSnapshot());
    let previousOnline:EngineSnapshot|null=null;
    const unsubscribe=online?[online.on('state',(state:NetworkState)=>{
      if(previousOnline?.multi&&state.snapshot.multi){
        const previous=previousOnline.multi;
        const next=state.snapshot.multi;
        if(next.players.some((player,i)=>player.stocks<previous.players[i].stocks))soundFX.koImpact();
        if(!previousOnline.roundOver&&state.snapshot.roundOver)soundFX.victoryFanfare();
      }
      previousOnline=state.snapshot;
      eng.applyNetworkState(state);setSnapshot(state.snapshot);}),
      online.on('connection',(ev:{reconnecting?:boolean;opponent?:boolean})=>setOnlineIssue(ev.reconnecting?'RECONEXIÓN EN CURSO…':'')),
      online.on('opponent_left',()=>setOnlineIssue('OTRO JUGADOR HA ABANDONADO LA SALA')),
      online.on('rematch',(event:{stage?:StageId;fighters?:FighterProfile[]})=>{
        if(event.fighters?.length===4)onRematch(event.fighters,event.stage);
      }),
      online.on('rematch_vote',(msg:{votes?:boolean[]})=>setVotes(msg.votes||[])),
      online.on('ranked_result',(result:typeof groupRating)=>setGroupRating(result))]:[];
    const canvasEl=canvas.current;
    const size=()=>{if(!canvasEl)return;const dpr=Math.min(2,window.devicePixelRatio||1);
      canvasEl.width=Math.round(STAGE_WIDTH*dpr);canvasEl.height=Math.round(STAGE_HEIGHT*dpr);};
    size();window.addEventListener('resize',size);
    const k1=blank(),k2=blank();
    const keydown=(e:KeyboardEvent)=>{
      if(e.code==='Escape'&&!e.repeat){e.preventDefault();if(eng.versusIntroFrames>0)return;setPaused(v=>!v);return;}
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
        eng.markerScale=Math.max(1,Math.min(2.2,640/Math.max(1,canvasEl.clientWidth)));
        const scale=canvasEl.width/STAGE_WIDTH;ctx.setTransform(scale,0,0,scale,0,0);eng.render(ctx);
      }
      raf=requestAnimationFrame(loop);
    };
    raf=requestAnimationFrame(loop);
    return()=>{cancelAnimationFrame(raf);unsubscribe.forEach(off=>off());if(ping)clearInterval(ping);
      window.removeEventListener('resize',size);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);
      window.removeEventListener('blur',clear);clear();soundFX.setCrowdedCombat(false);};
  },[fighters,battleMode,stage,difficulty,online,onRematch]);
  const summary=snapshot?.multi;
  const myPlayer=summary?.players[mySeat];
  // 2v2: teammates on the same side of the clock. FFA: seating order.
  const hudSeats=battleMode==='2V2'?[0,2,1,3]:[0,1,2,3];
  const goRematch=(profiles:FighterProfile[])=>{
    if(online){online.requestRematch(profiles[mySeat]);setRequested(true);}
    else onRematch(profiles);
  };
  return <main className="pb-group-screen">
    <div className="pb-group-stage"><canvas ref={canvas} width={STAGE_WIDTH} height={STAGE_HEIGHT}/>
    {(snapshot?.versusIntroFrames??0)>0 && <VersusIntro fighters={fighters} stage={stage} mode={battleMode} framesLeft={snapshot?.versusIntroFrames??0} rankTrophies={rankTrophies}/>}
    <header className="pb-group-hud" aria-label="Estado de los cuatro luchadores">
      <div className="pb-group-hud-grid">
        {hudSeats.map((seat,column)=>{
          const fighter=fighters[seat];
          const info=summary?.players[seat];
          const own=online?seat===mySeat:seat===0||(humanP2&&seat===1);
          const meter=Math.max(0,Math.min(100,info?.meter??0));
          const hpPct=Math.max(0,Math.min(100,Math.round(info?100*info.hp/Math.max(1,info.maxHp):100)));
          const lives=info?.stocks??3;
          return <React.Fragment key={seat}>
            {column===2&&<div className="pb-group-clock">
              <span className="pb-group-clock-caption">TIEMPO</span>
              <span className={`pb-group-clock-time ${(summary?.timeRemaining??240)<=10?'is-urgent':''}`}
                role="timer" aria-label={`Tiempo restante: ${summary?.timeRemaining??240} segundos`}>
                {matchClock(summary?.timeRemaining??240)}
              </span>
              <div className="pb-group-clock-bottom">
                <span className="pb-group-mode-label">{battleMode==='2V2'?<span className="pb-team-format"><span className="pb-team-digit">2</span><span className="pb-team-vs">VS</span><span className="pb-team-digit">2</span></span>:'FFA'}</span>
                <button type="button" className="pb-group-pause-button" onClick={()=>setPaused(true)} aria-label="Pausar" title="Pausa (Esc)"><Pause size={14}/></button>
              </div>
            </div>}
            <div className={`pb-group-player ${battleMode==='2V2'?(seat%2===0?'team-red':'team-blue'):`seat-${seat+1}`} ${own?'is-own':''} ${info?.eliminated?'is-eliminated':''}`}>
              <div className="pb-group-face">
                <div className={`pb-group-super-ring ${meter>=100?'is-ready':''}`} role="progressbar"
                  aria-label={`Súper de ${fighter.fighterName}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={meter}
                  title={`SÚPER ${meter}%${meter>=100?' · LISTO':''}`}>
                  {SUPER_RING_TILES.map(([row,col],i)=><i key={i} className={meter>=((i+1)*100/SUPER_RING_TILES.length)?'is-filled':''}
                    style={{gridRow:row,gridColumn:col}} aria-hidden="true"/>)}
                  <img src={fighter.portraitDataUrl} alt="" />
                  {meter>=100&&<span className="pb-group-super-ready" aria-hidden="true">S</span>}
                </div>
                <span className="pb-group-seat">{own?'★ ':''}P{seat+1}</span>
              </div>
              <div className="pb-group-info">
                <strong className="pb-group-name" title={fighter.fighterName}>{fighter.fighterName}</strong>
                <div className={`pb-group-health ${hpPct<=25?'is-critical':''}`} role="progressbar"
                  aria-label={`Vida de ${fighter.fighterName}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={hpPct}>
                  {info?.eliminated?'KO':<>{hpPct}<small>%</small></>}
                </div>
                <div className="pb-group-bottom-line">
                  <span className="pb-group-lives" aria-label={`${lives} vidas restantes`}>
                    {[0,1,2].map(i=><svg key={i} className={i<lives?'is-active':'is-lost'}
                      viewBox="0 0 16 14" aria-hidden="true" focusable="false">
                      <path d="M2 1H6V3H10V1H14V3H16V8H14V10H12V12H10V14H6V12H4V10H2V8H0V3H2Z"/>
                    </svg>)}
                  </span>
                  <span className="pb-group-kos" aria-label={`${info?.kos??0} eliminaciones`}>KO {info?.kos??0}</span>
                </div>
              </div>
            </div>
          </React.Fragment>;
        })}
      </div>
    </header>
      {!(snapshot?.versusIntroFrames??0)&&summary?.countdown&&<div className="pb-group-countdown" role="status" aria-live="off" aria-label={`Comienza en ${summary.countdown}`}>
        <div className="arena-announcement">
          <span key={summary.countdown}>{summary.countdown==='YA'?'¡FIGHT!':`RONDA 1 · ${summary.countdown}`}</span>
        </div>
      </div>}
      {koToast&&<div key={koToast.frame} className="pb-ko-moment" role="status" aria-live="off">
        <strong>K.O.!</strong><span>P{koToast.seat+1} · {koToast.eliminated?'ELIMINADO':'-1 VIDA'}</span>
      </div>}
      {snapshot?.roundOver&&!resultVisible&&<div className="arena-victory-moment pb-victory-moment" role="status" aria-live="polite">
        <strong className="arena-win-second">{summary?.isDraw?'¡EMPATE!':summary?.winningTeam?`¡EQUIPO ${summary.winningTeam==='RED'?'ROJO':'AZUL'} GANA!`:
          summary?.winnerSeat!=null?`¡P${summary.winnerSeat+1} GANA!`:'¡FIN DEL COMBATE!'}</strong>
        <span>{summary?.isDraw?'FIN DEL COMBATE':'¡VICTORIA!'}</span>
      </div>}
      {online&&<span className="pb-group-ping" aria-label="Latencia online">{latency===null?'●':`${latency} ms`}</span>}
      {onlineIssue&&<div className="pb-group-disconnect">{onlineIssue}<button type="button" onClick={onExit}>SALIR</button></div>}
    </div>
    {!snapshot?.roundOver&&<div className="pb-group-touch"><MobileControls inputRef={touch} superReady={(myPlayer?.meter??0)>=100}
      fixedStick={settings.fixed} southpaw={settings.southpaw} opacity={settings.opacity}
      comboStep={0} isFinisherReady={()=>false}
      manualAim getFacing={()=>engineRef.current?.getFighters()[mySeat]?.facing||1}
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
    {snapshot?.roundOver&&resultVisible&&<div className="pb-group-result-overlay"><RematchRoster players={fighters} roster={roster} allowCommunity={!!online&&!online.room?.ranked}
      selectableSeats={online?[mySeat]:[0,1,2,3]}
      onRematch={goRematch} onExit={onExit} requested={requested} votes={votes}
      labels={fighters.map((_,i)=>battleMode==='2V2'?`P${i+1} · ${i%2===0?'ROJO':'AZUL'}`:`JUGADOR ${i+1}`)}
      title={summary?.isDraw?'EMPATE':summary?.winningTeam?`GANA EQUIPO ${summary.winningTeam==='RED'?'ROJO':'AZUL'}`:
        summary?.winnerSeat!=null?`GANA ${fighters[summary.winnerSeat].fighterName}`:'FIN DEL COMBATE'}
      detail={<div className="pb-group-score"><span>{summary?.reason==='TIME'?'FIN DEL TIEMPO':'VICTORIA POR KO'}</span>
        <div className="pb-group-placements">{summary?.players.slice().sort((a,b)=>(a.place??5)-(b.place??5)).map(p=><small key={p.seat}>
          {p.place ? `#${p.place}` : '—'} · P{p.seat+1} · {p.name}</small>)}</div>
        {online?.room?.ranked&&<div className="pb-group-elo" aria-live="polite">{groupRating?.recorded ?
          groupRating.players?.map(p=><small key={p.seat}>P{p.seat+1} · ELO {p.old_rating} → {p.new_rating}
            <b className={p.delta>=0?'is-plus':'is-minus'}>{p.delta>=0?'+':''}{p.delta}</b></small>)
          :<small>{groupRating?.reason==='duplicate'?'RESULTADO YA REGISTRADO':groupRating?.reason==='server_error'?'ERROR AL REGISTRAR ELO':'REGISTRANDO ELO…'}</small>}
          {groupRating?.recorded&&groupRating.fighters?.map(f=><small key={`cup-${f.seat}`}>P{f.seat+1} · {f.league} · {f.before} → {f.after} COPAS ({f.change>=0?'+':''}{f.change}){f.rotation_bonus?' · BONUS +5':''}</small>)}
          {groupRating?.recorded&&groupRating.duos?.map(duo=><small key={`duo-${duo.team}`}>DÚO {duo.team==='RED'?'ROJO':'AZUL'} · {duo.league} · {duo.before} → {duo.after} COPAS ({duo.change>=0?'+':''}{duo.change})</small>)}
          </div>}
        {battleMode==='2V2'&&<strong className="pb-group-team-score">ROJO {summary?.teamKOs[0]??0} KO · AZUL {summary?.teamKOs[1]??0} KO</strong>}
        <div>{summary?.players.map(p=><small key={p.seat}>P{p.seat+1}: {p.kos} KO · {p.assists} ASIST. · {p.deaths} CAÍDAS · {p.stocks} VIDAS · {Math.round(p.damageDealt)} DAÑO</small>)}</div></div>}/></div>}
  </main>;
}
