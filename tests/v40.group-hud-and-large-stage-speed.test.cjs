'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { FightEngine } = require('../server/runtime/engine/FightEngine.js');
const { MultiFightEngine } = require('../server/runtime/engine/MultiFightEngine.js');
const profile=(id)=>({
  id, fighterName:`TEST ${id}`, archetype:'SHOTO_BALANCED',
  stats:{hp:25,power:25,technique:25,speed:25},
  moveset:{lightNormal:{name:'JAB',style:'FAST_JAB'},heavyNormal:{name:'PATADA',style:'LONG_ROUNDHOUSE'},
    specialNeutral:{name:'FUEGO',mechanic:'STRAIGHT_FIREBALL',visualAction:''},
    specialForward:{name:'RUSH',mechanic:'SLIDE_LOW_KICK',visualAction:''},
    specialUp:{name:'UP',mechanic:'INVINCIBLE_UPPERCUT',visualAction:''},
    ultimateSuper:{name:'SUPER',mechanic:'GIANT_BEAM_LASER',visualAction:''}},
  scaleMultiplier:1,portraitDataUrl:'data:image/png;base64,abc',spriteSheetDataUrl:'data:image/png;base64,abc',
});
const read=(p)=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('group HUD is inside the stage overlay, not a separate header that consumes arena height',()=>{
  const ui=read('src/components/GroupFightArena.tsx');
  const css=read('src/components/groupFightArena.css');
  assert.ok(ui.indexOf('<div className="pb-group-stage">')<ui.indexOf('<header className="pb-group-hud"'));
  assert.match(css,/\.pb-group-hud\s*\{[^}]*position:\s*absolute/s);
  assert.match(css,/\.pb-group-hud\s*\{[^}]*background:\s*linear-gradient\([^;]*rgba/s);
  assert.match(css,/\.pb-group-stage\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/s);
  assert.match(css,/@media \(orientation: landscape\)\s*\{[^}]*\.pb-group-stage\s*\{[^}]*inset:\s*0/s);
  assert.doesNotMatch(css,/--group-hud-height/);
  assert.doesNotMatch(css,/calc\([^;]*group-hud-height/);
});

test('mode and pause are vertically stacked and centered under the central timer',()=>{
  const css=read('src/components/groupFightArena.css');
  assert.match(css,/\.pb-group-clock-bottom\s*\{[^}]*flex-direction:\s*column;[^}]*align-items:\s*center;/s);
  assert.match(css,/\.pb-group-clock\s*\{[^}]*align-items:\s*center;/s);
  assert.match(css,/\.pb-group-pause-button\s*\{[^}]*pointer-events:\s*auto;/s);
  assert.match(read('src/components/GroupFightArena.tsx'),/className="pb-team-format"/);
  assert.match(css,/\.pb-team-format\s*\{/);
});

test('large arenas slow down walking and dashes 28%, without changing classic 1v1',()=>{
  const normal=new FightEngine(profile('a'),profile('b'),'1P_VS_2P','SKI_RESORT');
  const large=new FightEngine(profile('a'),profile('b'),'1P_VS_2P','SUNKEN_ATLANTIS');
  const ordinary=normal.getWalkSpeed(normal.p1),big=large.getWalkSpeed(large.p1);
  assert.ok(ordinary>0);
  assert.ok(Math.abs(big/ordinary-0.72)<1e-8);
  normal.triggerDash(normal.p1,1,false);
  large.triggerDash(large.p1,1,false);
  assert.ok(Math.abs(large.p1.vx/normal.p1.vx-0.72)<1e-8);
});

test('both multiplayer formats inherit the arena-size movement adjustment',()=>{
  for(const mode of ['2V2','FREE_FOR_ALL']){
    const e=new MultiFightEngine([0,1,2,3].map(i=>profile(String(i))),mode,'SPIRIT_FOREST');
    e.remoteHumanControls=true;
    e.countdownFrames=0;
    const x=e.p1.x;
    e.setSeatInput(0,{right:true});
    e.step();
    assert.ok(e.p1.x>x && e.p1.x-x<5,`${mode} speed should feel proportional to smaller sprites`);
  }
});
