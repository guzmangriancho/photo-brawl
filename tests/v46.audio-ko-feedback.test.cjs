'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {SoundFXEngine,soundFX}=require('../server/runtime/engine/SoundFX.js');
const {MultiFightEngine}=require('../server/runtime/engine/MultiFightEngine.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const moveset={lightNormal:{name:'JAB',style:'FAST_JAB'},heavyNormal:{name:'SMASH',style:'LONG_ROUNDHOUSE'},specialNeutral:{name:'BOLA',mechanic:'STRAIGHT_FIREBALL',visualAction:''},specialForward:{name:'AVANCE',mechanic:'SLIDE_LOW_KICK',visualAction:''},specialUp:{name:'UP',mechanic:'INVINCIBLE_UPPERCUT',visualAction:''},ultimateSuper:{name:'SUPER',mechanic:'GIANT_BEAM_LASER',visualAction:''}};
const profile=i=>({id:'fighter'+i,fighterName:'P'+i,archetype:'SHOTO_BALANCED',stats:{hp:25,power:25,technique:25,speed:25},moveset,passiveTrait:'FAST_METER_GAIN',scaleMultiplier:1,portraitDataUrl:'data:image/png;base64,x',spriteSheetDataUrl:'data:image/png;base64,x'});
const game=mode=>{const eng=new MultiFightEngine([0,1,2,3].map(profile),mode,'SUNKEN_ATLANTIS');eng.remoteHumanControls=true;return eng;};

// A tiny WebAudio test double checks that event scheduling stays bounded.
function fakeAudio(){
  const records={oscillators:0,noise:0};
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  const node=()=>({connect(){},disconnect(){},start(){},stop(){},frequency:param(),gain:param(),onended:null});
  const context={currentTime:0,state:'running',sampleRate:8000,destination:{},resume:async()=>{},
    createGain:()=>node(),createDynamicsCompressor:()=>({...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()}),
    createOscillator:()=>{records.oscillators++;return node();},
    createBuffer:(_,length)=>({getChannelData:()=>new Float32Array(length)}),
    createBufferSource:()=>{records.noise++;return node();},
    createBiquadFilter:()=>({...node(),type:'bandpass'}),
  };
  global.window={AudioContext:class{constructor(){return context;}}};
  return {context,records};
}
test('sound mixer limits a burst of repeated low priority sounds in crowded combat',()=>{
  const {context,records}=fakeAudio();
  try{
    const mixer=new SoundFXEngine();mixer.setCrowdedCombat(true);
    for(let i=0;i<20;i++)mixer.whiff();
    assert.equal(records.oscillators,1);
    context.currentTime=.12;mixer.whiff();assert.equal(records.oscillators,1,'group cooldown is longer than 120 ms');
    context.currentTime=.25;mixer.whiff();assert.equal(records.oscillators,2);
    context.currentTime=.5;mixer.koImpact();
    const before=records.oscillators;
    mixer.whiff();assert.equal(records.oscillators,before,'quiet misses duck during a KO');
    mixer.victoryFanfare();assert.ok(records.oscillators>before,'victory remains audible');
    mixer.muted=true;const silent=records.oscillators;context.currentTime+=2;mixer.lightHit();assert.equal(records.oscillators,silent);
  }finally{delete global.window;}
});
test('a stock loss uses KO impact; the winning team triggers victory only once',()=>{
 const eng=game('2V2');const oldKO=soundFX.koImpact,oldWin=soundFX.victoryFanfare;
 let kos=0,victories=0;soundFX.koImpact=()=>kos++;soundFX.victoryFanfare=()=>victories++;
 try{
  eng.triggerKnockout(eng.p1,eng.p2);
  assert.equal(kos,1);assert.equal(victories,0);assert.equal(eng.roundOver,false);
  assert.deepEqual(eng.getMultiSummary().lastKnockout,{frame:0,winnerSeat:0,loserSeat:1,eliminated:false});
  eng.respawnAt[1]=0;eng.triggerKnockout(eng.p1,eng.p2);
  eng.respawnAt[1]=0;eng.triggerKnockout(eng.p1,eng.p2);
  for(let i=0;i<3;i++){eng.respawnAt[3]=0;eng.triggerKnockout(eng.p1,eng.getFighters()[3]);}
  assert.equal(eng.roundOver,true);assert.equal(kos,6);assert.equal(victories,1);
  assert.equal(eng.p1.state,'VICTORY');assert.ok(eng.endPresentationFrames>0);
  const before=eng.endPresentationFrames;eng.step();assert.equal(eng.endPresentationFrames,before-1);
  const copy=game('2V2');copy.applyNetworkState(eng.exportNetworkState());
  assert.deepEqual(copy.getMultiSummary().lastKnockout,eng.getMultiSummary().lastKnockout);
 }finally{soundFX.koImpact=oldKO;soundFX.victoryFanfare=oldWin;}
});
test('group and duel final screens wait for the victory beat before showing rematch',()=>{
 const group=read('src/components/GroupFightArena.tsx');const duel=read('src/components/FightArena.tsx');
 assert.match(group,/setTimeout\(\(\)=>setResultVisible\(true\),1450\)/);
 assert.match(duel,/setTimeout\(\(\)=>setResultVisible\(true\),1450\)/);
 assert.match(group,/roundOver&&resultVisible&&<div className="pb-group-result-overlay"/);
 assert.match(duel,/roundOver && !paused && resultVisible/);
 assert.match(group,/pb-ko-moment/);assert.match(group,/pb-victory-moment/);
 assert.match(duel,/arena-victory-moment/);
});
