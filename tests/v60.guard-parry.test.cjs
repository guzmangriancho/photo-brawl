const fs=require('fs');
const ts=require('typescript');
const path=require('node:path').join(__dirname,'../src/engine/FightEngine.ts');
const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const vm=require('vm');
const soundFX=new Proxy({muted:true},{get:(t,p)=>p==='muted'?t.muted:()=>{}});
const mod={exports:{}};
vm.runInNewContext(js,{module:mod,exports:mod.exports,require:(id)=>id.includes('cpuTactics')?require('./helpers/cpuTactics.cjs'):id.includes('SoundFX')?{soundFX}:id.includes('SpriteProcessor')?{loadImage:async()=>null}:id.includes('stages')?{STAGE_ART:{},getLargeArena:()=>undefined}:null,console,Math,Date}, {filename:'FightEngine.js'});
const {FightEngine}=mod.exports;
const moveset={lightNormal:{name:'PUNO',style:'FAST_JAB'},heavyNormal:{name:'GOLPE',style:'LONG_ROUNDHOUSE'},specialNeutral:{name:'BOLA',mechanic:'STRAIGHT_FIREBALL',visualAction:'',primaryHex:'#40d9f5'},specialForward:{name:'IMPULSO',mechanic:'SLIDE_LOW_KICK',visualAction:''},specialUp:{name:'SHORYUKEN',mechanic:'INVINCIBLE_UPPERCUT',visualAction:''},ultimateSuper:{name:'OMEGA',mechanic:'GIANT_BEAM_LASER',visualAction:''}};
const profile=(name)=>({id:name,fighterName:name,archetype:'SHOTO_BALANCED',stats:{hp:25,power:25,technique:25,speed:25},moveset,passiveTrait:'DOUBLE_JUMP',portraitDataUrl:'',spriteSheetDataUrl:''});
const make=(mode='1P_VS_2P')=>{const e=new FightEngine(profile('p1'),profile('p2'),mode,'SKI_RESORT');e.announceTimer=0;e.versusIntroFrames=0;e.roundIntroFrames=0;e.p1.x=410;e.p2.x=492;return e};
const tick=(e,n=1)=>{for(let i=0;i<n;i++)e.step()};
const {test}=require('node:test');
const assert=require('node:assert/strict');

test('guard meter drains on blocked hits and breaks into a short exposed state',()=>{
  const e=make();
  assert.equal(e.p2.guardMeter,100);
  e.p2Input.guard=true;tick(e,12);
  const hp0=e.p2.hp;let last=e.p2.guardMeter,broke=false,drained=false;
  for(let i=0;i<40&&!broke;i++){
    e.queueTouchAction('HEAVY');
    for(let k=0;k<40;k++){
      tick(e,1);
      if(e.p2.state==='HURT'&&e.p2.hitstunFrames>20){broke=true;break;}
      if(e.p2.guardMeter<last){drained=true;last=e.p2.guardMeter;}
    }
    e.p2.stateFrame>0;
  }
  assert.ok(drained,'guard meter went down while blocking');
  assert.ok(broke,'guard eventually breaks');
  assert.ok(e.p2.guardMeter>0&&e.p2.guardMeter<=40,'meter resets to a partial value after a break, got '+e.p2.guardMeter);
  assert.ok(e.p2.hp<=hp0&&hp0-e.p2.hp<hp0*0.2,'break itself did not hit for full damage');
});

test('guard meter recovers while not holding guard, not while holding it',()=>{
  const e=make();e.p2.guardMeter=20;
  e.p2Input.guard=true;tick(e,60);
  assert.equal(e.p2.guardMeter,20,'no regen while holding guard');
  e.p2Input.guard=false;tick(e,60);
  assert.ok(e.p2.guardMeter>=45,'regen after release, got '+e.p2.guardMeter);
});

test('parry refills guard, pauses longer and keeps the 5-frame press window',()=>{
  const e=make();e.p2.guardMeter=30;
  e.queueTouchAction('LIGHT');tick(e,1);
  let pressed=false,parried=false;
  for(let i=0;i<30;i++){
    const a=e.p1.currentAttack;
    if(!pressed&&a&&e.p1.stateFrame>=a.startup-2){e.p2Input.guard=true;pressed=true;}
    tick(e,1);
    if(e.parryBursts.length){parried=true;break;}
  }
  assert.ok(parried,'jab was parried');
  assert.equal(e.p2.guardMeter,100,'parry refills guard');
  assert.ok(e.hitstopFrames>=8,'parry pause is longer, got '+e.hitstopFrames);
  assert.ok(e.parryBursts[0].life>=15,'parry burst lasts longer');
});

test('network state carries guardMeter and client tolerates old servers',()=>{
  const e=make();e.p1.guardMeter=63;
  const s=e.exportNetworkState();
  assert.equal(s.p1.guardMeter,63);
  const c=make();
  const old=JSON.parse(JSON.stringify(s));delete old.p1.guardMeter;
  c.applyNetworkState({...old,frame:old.frame+1});
  assert.equal(c.p1.guardMeter,100,'missing field keeps the default');
});

test('tap-spamming guard does not make jabs harmless and heavies are never parried',()=>{
  const run=(slot)=>{
    const e=make();let parries=0,thrown=0;const hp0=e.p2.hp;
    for(let f=0;f<600;f++){
      if(f%12===0){e.queueTouchAction(slot);thrown++;}
      e.p2Input.guard=(f%6)<2;
      const before=e.parryBursts.length;
      e.step();
      if(e.parryBursts.length>before)parries++;
      assert.ok(e.p2.guardMeter<=100&&e.p2.guardMeter>=0,'meter stays in 0..100');
    }
    return {parries,thrown,lost:hp0-e.p2.hp};
  };
  const jab=run('LIGHT');
  assert.ok(jab.parries<=jab.thrown/4,'spam parries only a minority of jabs: '+JSON.stringify(jab));
  assert.ok(jab.lost>0,'defender still takes damage while spamming');
  assert.equal(run('HEAVY').parries,0,'heavy attacks are not parryable');
});
