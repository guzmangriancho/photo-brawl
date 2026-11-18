const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const soundFX=new Proxy({}, {get:()=>()=>{}});
const fakeVfx=new Proxy({}, {get:()=>()=>{}});
function load(relative, dependencies={}) {
  const filename=path.join(root, relative);
  const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{}};
  vm.runInNewContext(js,{module:mod,exports:mod.exports,require:(id)=>dependencies[id] || (id.includes('SoundFX')?{soundFX}:id.includes('SpriteProcessor')?{loadImage:async()=>null}:id.includes('ArcadeVFX')?fakeVfx:id.includes('stages')?{STAGE_ART:{},getLargeArena:()=>undefined}:{}),console,Math,Date},{filename});
  return mod.exports;
}
const engineExports=load('src/engine/FightEngine.ts');
const {FightEngine,FLOOR_Y}=engineExports;
const lessons=load('src/components/tutorialLessons.ts',{'../engine/FightEngine':engineExports});
const {TUTORIAL_LESSONS,tutorialLessonCompleted,prepareTutorialLesson}=lessons;
const moveSet={
 lightNormal:{name:'JAB',style:'FAST_JAB'},heavyNormal:{name:'REMATE',style:'LONG_ROUNDHOUSE'},
 specialNeutral:{name:'BOLA',mechanic:'STRAIGHT_FIREBALL',visualAction:'',primaryHex:'#40d9f5'},
 specialForward:{name:'PATADA',mechanic:'SLIDE_LOW_KICK',visualAction:'',primaryHex:'#40d9f5'},
 specialUp:{name:'UPPERCUT',mechanic:'INVINCIBLE_UPPERCUT',visualAction:'',primaryHex:'#40d9f5'},
 ultimateSuper:{name:'OMEGA',mechanic:'GIANT_BEAM_LASER',visualAction:'',primaryHex:'#40d9f5'},
};
const profile=name=>({id:name,fighterName:name,archetype:'SHOTO_BALANCED',stats:{hp:25,power:25,technique:25,speed:25},moveset:moveSet,passiveTrait:'NONE',spriteSheetDataUrl:'',portraitDataUrl:''});
function make(){const e=new FightEngine(profile('P1'),profile('P2'),'TRAINING','SKI_RESORT');e.announceTimer=0;return e;}
const step=(e,n=1)=>{for(let i=0;i<n;i++)e.step();};
const lesson=(id)=>TUTORIAL_LESSONS.find(item=>item.id===id);

test('escuela arcade tiene 14 ejercicios distintos, progresión y contenido táctil/teclado',()=>{
  assert.equal(TUTORIAL_LESSONS.length,15);
  assert.equal(new Set(TUTORIAL_LESSONS.map(x=>x.id)).size,15);
  assert.equal(TUTORIAL_LESSONS.at(-1).id,'COMPLETE');
  for(const item of TUTORIAL_LESSONS){assert.ok(item.instruction.length>12);assert.ok(item.tip);assert.ok(item.keyboard);}
});

test('movimiento, salto y defensa en movimiento se detectan en el motor, no por toque',()=>{
  const e=make();const x=e.p1.x;
  assert.equal(tutorialLessonCompleted('MOVE',e,x),false);
  e.p1Input.right=true;step(e,14);assert.equal(tutorialLessonCompleted('MOVE',e,x),true);
  e.p1Input.right=false;
  e.p1Input.guard=true;const orig=e.p1.x;
  assert.equal(tutorialLessonCompleted('GUARD_WALK',e,orig),false);
  e.p1Input.left=true;step(e,13);assert.equal(tutorialLessonCompleted('GUARD_WALK',e,orig),true);
  e.p1Input.guard=false;e.p1Input.left=false;
  e.queueTouchJump();step(e,7);assert.equal(tutorialLessonCompleted('JUMP',e,x),true);
});

test('los jabs fallados no superan el ejercicio; el remate necesita impacto real y combo',()=>{
  const e=make();e.p1.x=260;e.p2.x=700;
  e.queueTouchAction('LIGHT');step(e,10);
  assert.equal(tutorialLessonCompleted('JAB',e,260),false);
  assert.equal(tutorialLessonCompleted('CHAIN',e,260),false);
  e.p1.x=410;e.p2.x=492;e.resetRound();e.p1.x=410;e.p2.x=492;
  e.queueTouchAction('LIGHT');step(e,4);
  assert.equal(tutorialLessonCompleted('JAB',e,410),true);
  assert.equal(tutorialLessonCompleted('CHAIN',e,410),false);
});

test('retos preparan distancias y muñeco correctamente, sin cambiar los modos normales',()=>{
  const e=make();
  prepareTutorialLesson(e,lesson('LOW'));
  assert.equal(e.trainingDummyMode,'GUARD_HIGH');assert.equal(e.p1.x,410);assert.equal(e.p2.x,492);
  prepareTutorialLesson(e,lesson('BLOCK'));
  assert.equal(e.trainingDummyMode,'TUTORIAL_JABS');assert.equal(e.p2.x,492);
  prepareTutorialLesson(e,lesson('SUPER'));
  assert.equal(e.trainingDummyMode,'IDLE');assert.equal(e.p2.x,650);
  assert.equal(e.p1.meter,100);
});

test('el muñeco anuncia el jab: startup lento SOLO en TRAINING y se puede hacer parry',()=>{
  const e=make();prepareTutorialLesson(e,lesson('BLOCK'));
  e.frameCount=99;step(e);
  assert.equal(e.p2.currentAttack?.slot,'LIGHT');
  assert.equal(e.p2.currentAttack?.startup,30);
  assert.equal(tutorialLessonCompleted('PARRY',e,410),false);
  step(e,26);
  e.p1Input.guard=true;
  step(e,4);
  assert.equal(tutorialLessonCompleted('PARRY',e,410),true);
  assert.ok(e.parryBursts.length>0);
  const offline=new FightEngine(profile('P1'),profile('P2'),'1P_VS_2P','SKI_RESORT');
  offline.p1.x=410;offline.p2.x=492;offline.queueTouchAction('LIGHT');step(offline);
  assert.ok(offline.p1.currentAttack?.startup < 30);
});

test('tutorial integrado con los botones móvil y sin duplicar conteos keyup',()=>{
  const arena=fs.readFileSync(path.join(root,'src/components/FightArena.tsx'),'utf8');
  assert.match(arena,/tutorialLessonCompleted\(lesson\.id,engine/);
  assert.match(arena,/prepareTutorialLesson\(engine,TUTORIAL_LESSONS\[0\]\)/);
  assert.doesNotMatch(arena,/noteTutorialAction|tutorialLightRef/);
  assert.match(arena,/SALTAR PASO/);
  assert.match(arena,/pb-school-progress/);
  assert.match(arena,/incomingJab/);
  const controls=fs.readFileSync(path.join(root,'src/components/MobileControls.tsx'),'utf8');
  assert.match(controls,/buttonHandlers\('guard'\)/);
  assert.match(controls,/mobile-super-center/);
});

test('combo de tres impactos y bajo que abre guardia alta se validan en una pelea real',()=>{
  const e=make();prepareTutorialLesson(e,lesson('JAB'));
  e.queueTouchAction('LIGHT');step(e,12);
  assert.equal(tutorialLessonCompleted('JAB',e,410),true);
  assert.equal(tutorialLessonCompleted('CHAIN',e,410),false);
  e.queueTouchAction('LIGHT');step(e,12);
  assert.equal(tutorialLessonCompleted('CHAIN',e,410),true);
  e.queueTouchAction('LIGHT');step(e,12);
  assert.equal(tutorialLessonCompleted('FINISHER',e,410),true);

  prepareTutorialLesson(e,lesson('LOW'));
  e.queueTouchAction('LOW');step(e,8);
  assert.equal(tutorialLessonCompleted('LOW',e,410),true);
  assert.ok(e.p2.hp<e.p2.maxHp,'la guardia alta no debe detener el golpe bajo');
});

test('dash y los tres especiales se reconocen por estado real, no solo por la orden',()=>{
  const e=make();
  e.queueTouchDash(1);step(e);
  assert.equal(tutorialLessonCompleted('DASH',e,260),true);
  prepareTutorialLesson(e,lesson('SPECIAL'));
  e.queueTouchAction('SP_NEUTRAL');step(e);
  assert.equal(tutorialLessonCompleted('SPECIAL',e,410),true);
  e.resetRound();
  e.queueTouchAction('SP_FORWARD');step(e);
  assert.equal(tutorialLessonCompleted('FORWARD',e,410),true);
  e.resetRound();e.queueTouchAction('SP_UP');step(e);
  assert.equal(tutorialLessonCompleted('UP',e,410),true);
  e.resetRound();e.queueTouchAction('SUPER');step(e);
  assert.equal(tutorialLessonCompleted('SUPER',e,410),true);
});
