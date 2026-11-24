const fs=require('fs');
const ts=require('typescript');
const path=require('node:path').join(__dirname,'../src/engine/FightEngine.ts');
const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const vm=require('vm');
const soundFX=new Proxy({muted:true},{get:(t,p)=>p==='muted'?t.muted:()=>{}});
const mod={exports:{}};
vm.runInNewContext(js,{module:mod,exports:mod.exports,require:(id)=>id.includes('SoundFX')?{soundFX}:id.includes('SpriteProcessor')?{loadImage:async()=>null}:id.includes('stages')?{STAGE_ART:{},getLargeArena:()=>undefined}:null,console,Math,Date}, {filename:'FightEngine.js'});
const {FightEngine}=mod.exports;
const moveset={lightNormal:{name:'PUNO',style:'FAST_JAB'},heavyNormal:{name:'GOLPE',style:'LONG_ROUNDHOUSE'},specialNeutral:{name:'BOLA',mechanic:'STRAIGHT_FIREBALL',visualAction:'',primaryHex:'#40d9f5'},specialForward:{name:'IMPULSO',mechanic:'SLIDE_LOW_KICK',visualAction:''},specialUp:{name:'SHORYUKEN',mechanic:'INVINCIBLE_UPPERCUT',visualAction:''},ultimateSuper:{name:'OMEGA',mechanic:'GIANT_BEAM_LASER',visualAction:''}};
const profile=(name)=>({id:name,fighterName:name,archetype:'SHOTO_BALANCED',stats:{hp:25,power:25,technique:25,speed:25},moveset,passiveTrait:'DOUBLE_JUMP',portraitDataUrl:'',spriteSheetDataUrl:''});
const make=(mode='1P_VS_2P')=>{const e=new FightEngine(profile('p1'),profile('p2'),mode,'SKI_RESORT');e.announceTimer=0;e.versusIntroFrames=0;e.roundIntroFrames=0;e.p1.x=410;e.p2.x=492;return e};
const tick=(e,n=1)=>{for(let i=0;i<n;i++)e.step()};
const {test}=require('node:test');
const assert=require('node:assert/strict');


test('training free play: dummy leaves the wall and approaches; tutorial dummy stays put',()=>{
  for(const mode of ['IDLE','PARRY','MASH_LIGHT']){
    const e=make('TRAINING');e.trainingFreePlay=true;e.trainingDummyMode=mode;
    e.p2.x=40;e.p1.x=300;tick(e,240);
    assert.ok(e.p2.x>=110,mode+' dummy still at wall: '+e.p2.x);
  }
  const e=make('TRAINING');e.trainingFreePlay=true;e.trainingDummyMode='PARRY';e.p1.x=300;e.p2.x=700;tick(e,200);
  assert.ok(e.p2.x-e.p1.x<=140,'dummy did not approach: '+(e.p2.x-e.p1.x));
  const t=make('TRAINING');t.trainingDummyMode='TUTORIAL_JABS';t.p2.x=492;tick(e,1);tick(t,60);
  assert.equal(t.p2.x,492);
});
test('training PARRY dummy throws slow telegraphed jabs, HEAVY dummy throws heavies',()=>{
  const e=make('TRAINING');e.trainingFreePlay=true;e.trainingDummyMode='PARRY';e.p1.x=410;e.p2.x=492;
  let slow=false;for(let i=0;i<260;i++){tick(e);if(e.p2.state==='ATTACK'&&e.p2.currentAttack?.slot==='LIGHT'&&e.p2.currentAttack.startup===30)slow=true;}
  assert.ok(slow);
  const h=make('TRAINING');h.trainingFreePlay=true;h.trainingDummyMode='HEAVY';h.p1.x=410;h.p2.x=492;
  let heavy=false;for(let i=0;i<300;i++){tick(h);if(h.p2.currentAttack?.slot==='HEAVY')heavy=true;}
  assert.ok(heavy);
});
test('training starts clean: hitboxes off, no collision button over the arena; art-anchored bar and markers',()=>{
  const arena=fs.readFileSync(require('node:path').join(__dirname,'../src/components/FightArena.tsx'),'utf8');
  assert.match(arena,/useState\(false\);\s*\n\s*const \[showArenaCollisions/);
  assert.match(arena,/engine\.showHitboxes = false;/);
  assert.doesNotMatch(arena,/arena-collision-tools/);
  const vfx=fs.readFileSync(require('node:path').join(__dirname,'../src/engine/ArcadeVFX.ts'),'utf8');
  assert.match(vfx,/196 \* f\.scale/);
  const multi=fs.readFileSync(require('node:path').join(__dirname,'../src/engine/MultiFightEngine.ts'),'utf8');
  assert.match(multi,/196\*f\.scale/);
});
