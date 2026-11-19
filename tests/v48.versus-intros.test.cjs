'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {FightEngine}=require('../server/runtime/engine/FightEngine.js');
const {MultiFightEngine}=require('../server/runtime/engine/MultiFightEngine.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const moveset={lightNormal:{name:'JAB',style:'FAST_JAB'},heavyNormal:{name:'SMASH',style:'LONG_ROUNDHOUSE'},specialNeutral:{name:'FIRE',mechanic:'STRAIGHT_FIREBALL',visualAction:''},specialForward:{name:'RUSH',mechanic:'SLIDE_LOW_KICK',visualAction:''},specialUp:{name:'UP',mechanic:'INVINCIBLE_UPPERCUT',visualAction:''},ultimateSuper:{name:'SUPER',mechanic:'GIANT_BEAM_LASER',visualAction:''}};
const profile=i=>({id:'intro-'+i,fighterName:'INTRO '+i,archetype:'SHOTO_BALANCED',stats:{hp:25,power:25,technique:25,speed:25},moveset,passiveTrait:'FAST_METER_GAIN',scaleMultiplier:1,portraitDataUrl:'data:image/png;base64,abc',spriteSheetDataUrl:'data:image/png;base64,abc'});

test('duel introduction freezes both the match timer and the original round announcement',()=>{
 const e=new FightEngine(profile(1),profile(2),'1P_VS_CPU','SKI_RESORT');
 const hp=[e.p1.hp,e.p2.hp],time=e.roundTimerFrames,announce=e.announceTimer;
 e.beginVersusIntro();
 assert.equal(e.getSnapshot().versusIntroFrames,90);
 for(let i=0;i<89;i++){e.step();assert.equal(e.roundTimerFrames,time);assert.equal(e.announceTimer,announce);}
 assert.equal(e.versusIntroFrames,1);
 e.step();assert.equal(e.versusIntroFrames,0);
 assert.deepEqual([e.p1.hp,e.p2.hp],hp);
 assert.equal(e.roundTimerFrames,time);assert.equal(e.announceTimer,announce);
 e.step();assert.equal(e.roundTimerFrames,time-1);
});

test('buffered online attacks, jumps and dash cannot execute during intro',()=>{
 const e=new FightEngine(profile(1),profile(2),'1P_VS_2P','NIGHT_PLAZA');
 e.beginVersusIntro();
 e.queueNetworkAction(0,'LIGHT');e.queueNetworkJump(0);e.queueNetworkDash(0,1);
 assert.equal(e.p1.bufferedActions.length,0);
 assert.equal(e.p1.bufferedJumpFrame,null);assert.equal(e.p1.bufferedDash,null);
 e.p1.bufferedActions.push({slot:'LIGHT',frame:0});
 e.step();assert.deepEqual(e.p1.bufferedActions,[]);
});

test('2v2 and FFA introductions preserve ALL 210 frames of 3-2-1-YA countdown',()=>{
 for(const mode of ['2V2','FREE_FOR_ALL']){
  const fighters=[0,1,2,3].map(profile);
  const e=new MultiFightEngine(fighters,mode,'SUNKEN_ATLANTIS');e.remoteHumanControls=true;
  const clock=e.roundTimerFrames;
  e.beginVersusIntro();
  for(let i=0;i<90;i++){
   const snap=e.getSnapshot();assert.equal(snap.multi.countdown,'3');
   e.step();assert.equal(e.roundTimerFrames,clock);
  }
  assert.equal(e.getSnapshot().multi.countdown,'3');
  assert.equal(e.getSnapshot().versusIntroFrames,0);
  for(let i=0;i<60;i++)e.step();
  assert.equal(e.getSnapshot().multi.countdown,'2');
  for(let i=0;i<60;i++)e.step();
  assert.equal(e.getSnapshot().multi.countdown,'1');
  for(let i=0;i<60;i++)e.step();
  assert.equal(e.getSnapshot().multi.countdown,'YA');
  for(let i=0;i<30;i++)e.step();
  assert.equal(e.getSnapshot().multi.countdown,null);
  assert.equal(e.roundTimerFrames,clock);
  e.step();assert.equal(e.roundTimerFrames,clock-1);
 }
});

test('network state carries authoritative intro phase, including late arrivals',()=>{
 const a=new MultiFightEngine([0,1,2,3].map(profile),'2V2','CELESTIAL_TEMPLE');
 a.beginVersusIntro();for(let i=0;i<33;i++)a.step();
 const b=new MultiFightEngine([0,1,2,3].map(profile),'2V2','CELESTIAL_TEMPLE');
 b.applyNetworkState(a.exportNetworkState());
 assert.equal(a.getSnapshot().versusIntroFrames,57);
 assert.equal(b.getSnapshot().versusIntroFrames,57);
 assert.equal(b.getSnapshot().multi.countdown,'3');
 const d=new FightEngine(profile(0),profile(1),'1P_VS_2P','SKI_RESORT');
 d.beginVersusIntro();d.step();
 const guest=new FightEngine(profile(0),profile(1),'1P_VS_2P','SKI_RESORT');
 guest.applyNetworkState(d.exportNetworkState());
 assert.equal(guest.getSnapshot().versusIntroFrames,89);
});

test('all five entrance paths enable VS (local duel/group, online duel/group, rematches)',()=>{
 const duel=read('src/components/FightArena.tsx'),group=read('src/components/GroupFightArena.tsx');
 const onlineDuel=read('server/rooms.cjs'),onlineGroup=read('server/group-rooms.cjs');
 assert.match(duel,/engine\.beginVersusIntro\(\)/);
 assert.match(group,/eng\.beginVersusIntro\(\)/);
 assert.equal(onlineDuel.match(/room\.engine\.beginVersusIntro\(\)/g).length,2);
 assert.equal(onlineGroup.match(/room\.engine\.beginVersusIntro\(\)/g).length,2);
 assert.match(group, /!\(snapshot\?\.versusIntroFrames\?\?0\)&&summary\?\.countdown/);
});

test('presentation shows original stage art, differentiated 2v2 teams and four FFA portraits',()=>{
 const ui=read('src/components/VersusIntro.tsx');
 const css=read('src/components/versusIntro.css');
 assert.match(ui,/STAGE_ART\[stage\]/);
 assert.match(ui,/\[\[0, 2\], \[1, 3\]\]/);
 assert.match(ui,/fighters\.slice\(0, 4\)/);
 assert.match(ui,/versusMotion\(framesLeft\)/);
 assert.doesNotMatch(css,/@keyframes|animation: pb-vs/);
 assert.match(css,/@media \(orientation: portrait\)/);
 assert.match(css,/prefers-reduced-motion/);
});
