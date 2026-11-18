import { FightEngine, type FighterRuntime, type InputState, type MoveSlot, type EngineSnapshot } from './FightEngine';
import type { FighterProfile, GroupBattleMode, CpuDifficulty, StageId } from '../types/fighter';
import type { NetworkFighter, NetworkState } from '../network/protocol';
import { getLargeArena } from '../data/stages';

/** V35: Four-seat stock combat on the SAME movement, attacks, hitboxes and platform physics as 1v1.
 *  Server runs the authoritative instance. No ranked/ELO integration is permitted. */
export type TeamColor = 'RED' | 'BLUE' | null;
export interface MultiFighterScore {
  seat: number; team: TeamColor; name: string; hp: number; maxHp: number; meter: number;
  stocks: number; kos: number; deaths: number; assists:number; damageDealt: number; eliminated: boolean;
  respawnIn: number;
}
export interface MultiMatchSummary {
  mode: GroupBattleMode;
  players: MultiFighterScore[];
  winnerSeat: number | null;
  winningTeam: TeamColor;
  isDraw: boolean;
  reason: 'KOS' | 'TIME' | null;
  teamKOs: [number,number];
  timeRemaining: number;
}
const LOCATIONS = [150, 810, 375, 585];
const NEW_STAGES = ['SUNKEN_ATLANTIS','SPIRIT_FOREST','CELESTIAL_TEMPLE','VOLCANIC_FORTRESS'];
const clearInput = ():InputState=>({left:false,right:false,up:false,down:false,guard:false,light:false,heavy:false,spNeutral:false,spForward:false,spUp:false,superBtn:false,romanCancel:false,dashLeft:false,dashRight:false});

export class MultiFightEngine extends FightEngine {
  readonly battleMode: GroupBattleMode;
  private extras: FighterRuntime[] = [];
  private inputs: InputState[] = Array.from({length:4},clearInput);
  private stocks = [3,3,3,3];
  private kos = [0,0,0,0];
  private deaths = [0,0,0,0];
  private assists = [0,0,0,0];
  private lastDamaged: {attacker:number;frame:number}[][]=[[],[],[],[]];
  private lastKOFrame=[-999,-999,-999,-999];
  private damageDealt = [0,0,0,0];
  private respawnAt = [0,0,0,0];
  public winnerSeat: number | null = null;
  public winningTeam: TeamColor = null;
  public isDraw = false;
  public endReason: 'KOS'|'TIME'|null=null;
  /** Local offline games use 1 human, or optional second keyboard/controller player. */
  public localHumanSeats = 1;
  /** Server-authoritative online matches set this to true to disable bot inputs. */
  public remoteHumanControls = false;

  constructor(profiles: [FighterProfile,FighterProfile,FighterProfile,FighterProfile],
    battleMode: GroupBattleMode, stage: StageId, difficulty: CpuDifficulty='NORMAL') {
    if(!NEW_STAGES.includes(stage) || !getLargeArena(stage)) throw new Error('Los combates de 4 solo admiten mapas multinivel.');
    super(profiles[0],profiles[1],'1P_VS_2P',stage,difficulty);
    this.battleMode=battleMode;
    this.p1.x=LOCATIONS[0];this.p2.x=LOCATIONS[1];
    this.extras=[this.createFighterRuntime(2,profiles[2],LOCATIONS[2],1),
                 this.createFighterRuntime(3,profiles[3],LOCATIONS[3],-1)];
    this.roundTimerFrames=4*60*60;
    this.announceText=battleMode==='2V2'?'¡EQUIPOS LISTOS!':'¡TODOS CONTRA TODOS!';
    this.announceTimer=90;
  }
  override getFighters(): FighterRuntime[] { return [this.p1,this.p2,...this.extras]; }
  protected override getInputFor(index:number):InputState {return this.inputs[index] || clearInput();}
  protected override getFighterByIndex(index:number):FighterRuntime {return this.getFighters()[index] || this.p1;}
  protected override canDamage(a:FighterRuntime,b:FighterRuntime):boolean {
    return a.index!==b.index && (this.battleMode==='FREE_FOR_ALL' || a.index%2!==b.index%2);
  }
  override async loadAssets():Promise<void>{
    await super.loadAssets();
    if(typeof Image==='undefined')return;
    await Promise.all(this.extras.map(async f=>{
      try {const img=new Image();img.src=f.profile.spriteSheetDataUrl;
        await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=reject;});f.spriteSheet=img;
      }catch {f.spriteSheet=null;}
    }));
  }
  private resetSeat(index:number){
    const old=this.getFighters()[index],spriteSheet=old.spriteSheet;
    const runtime=this.createFighterRuntime(index,old.profile,LOCATIONS[index],index%2===0?1:-1);
    runtime.spriteSheet=spriteSheet;
    if(index===0)this.p1=runtime;else if(index===1)this.p2=runtime;else this.extras[index-2]=runtime;
    this.inputs[index]=clearInput();
  }
  override resetRound():void {
    this.stocks=[3,3,3,3];this.kos=[0,0,0,0];this.deaths=[0,0,0,0];
    this.damageDealt=[0,0,0,0];this.assists=[0,0,0,0];this.lastDamaged=[[],[],[],[]];
    this.lastKOFrame=[-999,-999,-999,-999];this.respawnAt=[0,0,0,0];
    this.winnerSeat=null;this.winningTeam=null;this.isDraw=false;this.endReason=null;
    super.resetRound();
    this.getFighters().forEach((_,index)=>this.resetSeat(index));
    this.projectiles=[];this.roundTimerFrames=4*60*60;
    this.roundOver=false;this.winnerName=null;
    this.roundBreakFrames=0;this.roundIntroFrames=0;
    this.announceText='¡COMBATE!';this.announceTimer=70;
  }
  override queueNetworkAction(index:0|1,slot:MoveSlot):void {
    const f=this.getFighters()[index];if(!f||this.roundOver||this.stocks[index]===0||this.respawnAt[index])return;
    if(slot==='SUPER' && f.meter<100)return;
    f.bufferedActions.push({slot,frame:this.frameCount});if(f.bufferedActions.length>4)f.bufferedActions.shift();
  }
  override queueNetworkJump(index:0|1):void {
    const f=this.getFighters()[index];if(f&&!this.roundOver&&this.stocks[index]>0&&!this.respawnAt[index])f.bufferedJumpFrame=this.frameCount;
  }
  override queueNetworkDash(index:0|1,dir:1|-1):void {
    const f=this.getFighters()[index];if(f&&!this.roundOver&&this.stocks[index]>0&&!this.respawnAt[index])f.bufferedDash={dir,frame:this.frameCount};
  }
  public setSeatInput(index:number,input:InputState):void {
    if(index<0||index>3||!Number.isInteger(index))return;
    this.inputs[index]={...input};
  }
  public getSeatInput(index:number):InputState{return this.inputs[index]||clearInput();}
  private nearestOpponent(f:FighterRuntime):FighterRuntime {
    return this.getFighters().filter(o=>o!==f&&this.stocks[o.index]>0&&!this.respawnAt[o.index]&&this.canDamage(f,o))
      .sort((a,b)=>Math.abs(a.x-f.x)-Math.abs(b.x-f.x))[0] || this.getFighters().find(o=>o!==f) || f;
  }
  override shouldRenderFighter(f:FighterRuntime):boolean {
    return f.hp>0 || this.frameCount-this.lastKOFrame[f.index]<37;
  }
  protected override onDamage(a:FighterRuntime,b:FighterRuntime,amount:number):void {
    this.damageDealt[a.index]+=Math.max(0,amount);
    const events=this.lastDamaged[b.index];
    this.lastDamaged[b.index]=events.filter(hit=>this.frameCount-hit.frame<=8*60&&hit.attacker!==a.index)
      .concat({attacker:a.index,frame:this.frameCount});
  }
  protected override resolveCharacterCollision():void {
    const fs=this.getFighters().filter(f=>f.hp>0);
    for(let a=0;a<fs.length;a++)for(let b=a+1;b<fs.length;b++){
      const left=fs[a],right=fs[b];
      if(Math.abs(left.y-right.y)>Math.max(left.hurtbox.height,right.hurtbox.height)*0.45)continue;
      const overlap=(left.hurtbox.width+right.hurtbox.width)*0.42-Math.abs(left.x-right.x);
      if(overlap<=0)continue;
      const dir=left.x<=right.x?1:-1;
      left.x=Math.max(24,Math.min(936,left.x-dir*overlap/2));
      right.x=Math.max(24,Math.min(936,right.x+dir*overlap/2));
    }
  }
  protected override triggerKnockout(winner:FighterRuntime,loser:FighterRuntime):void {
    const seat=loser.index;if(this.stocks[seat]<=0||this.respawnAt[seat]>0)return;
    this.stocks[seat]--;this.deaths[seat]++;this.kos[winner.index]++;
    this.lastKOFrame[seat]=this.frameCount;
    for(const hit of this.lastDamaged[seat])if(hit.attacker!==winner.index&&this.canDamage(this.getFighters()[hit.attacker],loser))this.assists[hit.attacker]++;
    this.lastDamaged[seat]=[];
    loser.hp=0;loser.state='KO';loser.stateFrame=0;loser.vy=-7;
    this.respawnAt[seat]=this.stocks[seat]>0?this.frameCount+100:0;
    this.hitstopFrames=9;this.shakeIntensity=10;
    this.announceText=`K.O. · ${winner.profile.fighterName}`;this.announceTimer=72;
    this.checkWinner();
  }
  private finish(winnerSeat:number|null,team:TeamColor,reason:'KOS'|'TIME',draw=false){
    if(this.roundOver)return;
    this.roundOver=true;this.endReason=reason;this.winnerSeat=winnerSeat;this.winningTeam=team;this.isDraw=draw;
    this.winnerName=draw?null:team?`EQUIPO ${team==='RED'?'ROJO':'AZUL'}`:winnerSeat!==null?this.getFighters()[winnerSeat].profile.fighterName:null;
    this.announceText=draw?'EMPATE':`${this.winnerName} · ¡VICTORIA!`;this.announceTimer=200;
  }
  private checkWinner(){
    if(this.roundOver)return;
    if(this.battleMode==='2V2'){
      const red=this.stocks[0]+this.stocks[2],blue=this.stocks[1]+this.stocks[3];
      if(red===0&&blue===0)this.finish(null,null,'KOS',true);
      else if(red===0)this.finish(null,'BLUE','KOS');
      else if(blue===0)this.finish(null,'RED','KOS');
    }else{
      const alive=this.stocks.map((v,i)=>v>0?i:-1).filter(i=>i>=0);
      if(alive.length===0)this.finish(null,null,'KOS',true);
      else if(alive.length===1)this.finish(alive[0],null,'KOS');
    }
  }
  private timeout(){
    const fs=this.getFighters();
    if(this.battleMode==='2V2'){
      const team=(parity:number)=>{
        const seats=[parity,parity+2];return {stocks:seats.reduce((n,i)=>n+this.stocks[i],0),
          hp:seats.reduce((n,i)=>n+(this.stocks[i]>0?fs[i].hp/fs[i].maxHp:0),0)};
      };
      const a=team(0),b=team(1);
      if(a.stocks>b.stocks||(a.stocks===b.stocks&&a.hp>b.hp+0.0001))this.finish(null,'RED','TIME');
      else if(b.stocks>a.stocks||(a.stocks===b.stocks&&b.hp>a.hp+0.0001))this.finish(null,'BLUE','TIME');
      else this.finish(null,null,'TIME',true);
    }else{
      const ordered=this.stocks.map((stock,i)=>({i,stock,hp:stock>0?fs[i].hp/fs[i].maxHp:0}))
        .sort((a,b)=>b.stock-a.stock||b.hp-a.hp);
      if(ordered[0].stock===ordered[1].stock&&Math.abs(ordered[0].hp-ordered[1].hp)<0.0001)
        this.finish(null,null,'TIME',true);
      else this.finish(ordered[0].i,null,'TIME');
    }
  }
  override step():void {
    this.frameCount++;
    if(this.roundOver)return;
    if(this.announceTimer>0)this.announceTimer--;
    if(this.shakeIntensity>0)this.shakeIntensity=Math.max(0,this.shakeIntensity-0.85);
    const fs=this.getFighters();
    if(!this.remoteHumanControls){
      for(const f of fs){
        if(f.index>=this.localHumanSeats && this.stocks[f.index]>0 && !this.respawnAt[f.index])
          this.inputs[f.index]=this.computeCpuInput(f,this.nearestOpponent(f));
      }
    }
    for(const f of fs)if(f.hp>0)this.captureCommands(f,this.inputs[f.index]);
    if(this.superFlashFrames>0){this.superFlashFrames--;this.updateParticles();return;}
    if(this.hitstopFrames>0){this.hitstopFrames--;this.updateParticles();return;}
    if(this.roundTimerFrames>0)this.roundTimerFrames--;else{this.timeout();return;}
    for(const f of fs){
      if(this.stocks[f.index]===0)continue;
      if(this.respawnAt[f.index]){
        if(this.frameCount>=this.respawnAt[f.index]){
          this.respawnAt[f.index]=0;this.resetSeat(f.index);
          this.getFighters()[f.index].invincibleFrames=110;
        }
        continue;
      }
      this.updateFighter(f,this.nearestOpponent(f),this.inputs[f.index]);
    }
    this.resolveCharacterCollision();
    for(const f of this.getFighters()){
      if(f.hp<=0)continue;
      for(const target of this.getFighters()){
        if(target.hp<=0||!this.canDamage(f,target))continue;
        this.resolveAttackCollisions(f,target);
        if(this.roundOver)break;
      }
      if(this.roundOver)break;
    }
    if(!this.roundOver)this.updateProjectiles();
    this.updateParticles();this.updateAfterimages();
    for(const f of this.getFighters())f.prevInput={...this.inputs[f.index]};
  }
  public getMultiSummary():MultiMatchSummary {
    const fs=this.getFighters();
    return {
      mode:this.battleMode,
      players:fs.map(f=>({seat:f.index,team:this.battleMode==='2V2'?(f.index%2===0?'RED':'BLUE'):null,
        name:f.profile.fighterName,hp:f.hp,maxHp:f.maxHp,meter:Math.floor(f.meter),
        stocks:this.stocks[f.index],kos:this.kos[f.index],deaths:this.deaths[f.index],assists:this.assists[f.index],
        damageDealt:this.damageDealt[f.index],eliminated:this.stocks[f.index]===0,
        respawnIn:this.respawnAt[f.index]>0?Math.max(0,Math.ceil((this.respawnAt[f.index]-this.frameCount)/60)):0})),
      winnerSeat:this.winnerSeat,winningTeam:this.winningTeam,isDraw:this.isDraw,
      reason:this.endReason,
      teamKOs:[this.kos[0]+this.kos[2],this.kos[1]+this.kos[3]],
      timeRemaining:Math.max(0,Math.ceil(this.roundTimerFrames/60)),
    };
  }
  override getSnapshot():EngineSnapshot {return {...super.getSnapshot(),multi:this.getMultiSummary()};}
  override exportNetworkState():NetworkState {
    const base=super.exportNetworkState();
    const fields=(f:FighterRuntime):NetworkFighter=>({
      x:f.x,y:f.y,vx:f.vx,vy:f.vy,facing:f.facing,hp:f.hp,maxHp:f.maxHp,meter:f.meter,
      state:f.state,stateFrame:f.stateFrame,hitstunFrames:f.hitstunFrames,blockstunFrames:f.blockstunFrames,
      invincibleFrames:f.invincibleFrames,projectileCooldownFrames:f.projectileCooldownFrames,
      lightChainCount:f.lightChainCount,comboCount:f.comboCount,comboDamage:f.comboDamage,comboTimer:f.comboTimer,
      jumpsRemaining:f.jumpsRemaining,airDashUsed:f.airDashUsed,hasArmorActive:f.hasArmorActive,
      currentAttack:f.currentAttack as unknown as Record<string,unknown>|null,grabbedBy:f.grabbedBy,grabSlamTimer:f.grabSlamTimer,
    });
    return {...base,snapshot:this.getSnapshot(),fighters:this.getFighters().map(fields)};
  }
  override applyNetworkState(state:NetworkState):void {
    super.applyNetworkState(state);
    if(state.fighters?.length===4){
      state.fighters.slice(2).forEach((f,i)=>Object.assign(this.extras[i],f));
    }
    if(state.snapshot.multi){
      const summary=state.snapshot.multi;
      summary.players.forEach(s=>{
        this.stocks[s.seat]=s.stocks;this.kos[s.seat]=s.kos;this.deaths[s.seat]=s.deaths;this.assists[s.seat]=s.assists;
        this.damageDealt[s.seat]=s.damageDealt;
        this.respawnAt[s.seat]=s.respawnIn?this.frameCount+s.respawnIn*60:0;
        if(s.hp<=0&&this.lastKOFrame[s.seat]<this.frameCount-37)this.lastKOFrame[s.seat]=this.frameCount;
      });
      this.winnerSeat=summary.winnerSeat;this.winningTeam=summary.winningTeam;
      this.isDraw=summary.isDraw;this.endReason=summary.reason;
    }
  }
}
