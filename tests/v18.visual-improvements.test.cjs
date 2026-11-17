const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {FightEngine,FLOOR_Y} = require('../server/runtime/engine/FightEngine.js');

const fakeProfile = {
  id:'visual-qa',fighterName:'Visual QA',archetype:'SHOTO_BALANCED',
  stats:{hp:25,power:25,technique:25,speed:25},
  moveset:{lightNormal:{name:'A',style:'FAST_JAB'},heavyNormal:{name:'B',style:'LONG_ROUNDHOUSE'},
  specialNeutral:{name:'C',mechanic:'STRAIGHT_FIREBALL'},specialForward:{name:'D',mechanic:'SLIDE_LOW_KICK'},
  specialUp:{name:'E',mechanic:'INVINCIBLE_UPPERCUT'},ultimateSuper:{name:'F',mechanic:'GIANT_BEAM_LASER'}},
  passiveTrait:'FAST_METER_GAIN',spriteSheetDataUrl:'',portraitDataUrl:''
};
function mockContext(){
  const out={rectangles:0,radialGradients:0,gradientStops:[],translations:[]};
  return {
    out,save(){},restore(){},scale(){},beginPath(){},arc(){},fill(){},
    fillRect(){out.rectangles++},
    translate(x,y){out.translations.push([x,y]);},
    createRadialGradient(){out.radialGradients++;return {addColorStop(offset,color){out.gradientStops.push([offset,color]);}};}
  };
}
test('ground shadow is elliptical, layered and never a rectangle',()=>{
  const engine = new FightEngine(fakeProfile,fakeProfile,'TRAINING','SKI_RESORT');
  const before = JSON.stringify({x:engine.p1.x,y:engine.p1.y,state:engine.p1.state});
  const ctx = mockContext();
  engine.renderShadow(ctx,engine.p1);
  assert.equal(ctx.out.rectangles,0);
  assert.equal(ctx.out.radialGradients,2);
  assert.ok(ctx.out.gradientStops.some(([stop])=>stop===1));
  assert.deepEqual(ctx.out.translations[0],[engine.p1.x,FLOOR_Y+2]);
  assert.equal(JSON.stringify({x:engine.p1.x,y:engine.p1.y,state:engine.p1.state}),before);
});
test('airborne shadow fades out and the tight contact core disappears',()=>{
  const engine = new FightEngine(fakeProfile,fakeProfile,'TRAINING','SKI_RESORT');
  const grounded=mockContext();engine.renderShadow(grounded,engine.p1);
  engine.p1.y=FLOOR_Y-220;
  const jumping=mockContext();engine.renderShadow(jumping,engine.p1);
  assert.equal(jumping.out.radialGradients,1);
  assert.ok(jumping.out.translations[0][0]>grounded.out.translations[0][0]);
  const alpha = ctx => Number(ctx.out.gradientStops[0][1].match(/, ([\d.]+)\)$/)?.[1]);
  assert.ok(alpha(jumping)<alpha(grounded));
});
test('home fighter animates only sheet idle cells 0 and 1',()=>{
  const jsx=fs.readFileSync(path.join(__dirname,'../src/components/CharacterSelect.tsx'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../src/components/arcadeMenus.css'),'utf8');
  assert.match(jsx,/pb-fighter-stand pb-fighter-idle/);
  assert.match(css,/@keyframes pb-character-idle/);
  assert.match(css,/background-position:\s*0% 0%/);
  assert.match(css,/background-position:\s*33\.333333% 0%/);
  assert.match(css,/prefers-reduced-motion:\s*reduce/);
});
test('HUD uses a separate portrait slot that matches meter height',()=>{
  const jsx=fs.readFileSync(path.join(__dirname,'../src/components/FightArena.tsx'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../src/components/fightArena.css'),'utf8');
  assert.equal((jsx.match(/className="arena-portrait-slot"/g)||[]).length,2);
  assert.match(css,/\.arena-portrait-slot\s*\{/);
  assert.match(css,/\.arena-player-two \.arena-portrait-slot\s*\{ grid-column: 2/);
  assert.match(css,/\.arena-portrait-slot \.arena-portrait\s*\{/);
});
