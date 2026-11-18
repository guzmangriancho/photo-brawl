'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {FightEngine} = require('../server/runtime/engine/FightEngine.js');
const {getLargeArena, STAGE_IDS, STAGE_ART} = require('../server/runtime/data/stages.js');
const root = path.join(__dirname,'..');
const newStages = ['SUNKEN_ATLANTIS','SPIRIT_FOREST','CELESTIAL_TEMPLE','VOLCANIC_FORTRESS'];
const moveset = {
  lightNormal:{name:'JAB',style:'FAST_JAB'},heavyNormal:{name:'SMASH',style:'LONG_ROUNDHOUSE'},
  specialNeutral:{name:'BOLA',mechanic:'STRAIGHT_FIREBALL',visualAction:'',primaryHex:'#40d9f5'},
  specialForward:{name:'AVANCE',mechanic:'SLIDE_LOW_KICK',visualAction:''},
  specialUp:{name:'UP',mechanic:'INVINCIBLE_UPPERCUT',visualAction:''},
  ultimateSuper:{name:'SUPER',mechanic:'GIANT_BEAM_LASER',visualAction:''},
};
const profile = (id,tank=false)=>({id,fighterName:id,archetype:tank?'GRAPPLER_TANK':'SHOTO_BALANCED',
  stats:{hp:25,power:25,technique:25,speed:25},moveset,passiveTrait:'NONE',
  scaleMultiplier:1,portraitDataUrl:'',spriteSheetDataUrl:''});
const make = (stage,tank=false) => {
  const engine = new FightEngine(profile('one',tank),profile('two'),'TRAINING',stage);
  engine.announceTimer=0;
  engine.trainingDummyMode='IDLE';
  engine.p2.x=850;
  engine.p2.state='IDLE';
  return engine;
};
const tick = (e,n=1)=>{for(let i=0;i<n;i++)e.step();};
test('four full-res supplied maps are present across menus, server and selection',()=>{
  for (const id of newStages){
    assert.ok(STAGE_IDS.includes(id));
    assert.ok(STAGE_ART[id].name.length);
    const file=path.join(root,'public',STAGE_ART[id].image.replace(/^\//,''));
    assert.ok(fs.statSync(file).size>200_000,`${id} has full-size supplied art`);
    assert.equal(fs.readFileSync(file).subarray(0,2).toString('hex'),'ffd8');
    assert.ok(fs.readFileSync(path.join(root,'server/rooms.cjs'),'utf8').includes(id));
  }
  assert.equal(STAGE_IDS.length,9);
});
test('each new arena has one continuous ground and platform tops aligned within canvas',()=>{
  for(const id of newStages){
    const arena=getLargeArena(id);
    assert.ok(arena);
    assert.ok(arena.floorY>420 && arena.floorY<470);
    assert.ok(arena.fighterScale<0.75 && arena.fighterScale>0.5);
    assert.ok(arena.platforms.length>=3 && arena.platforms.length<=4);
    const e=make(id);
    assert.equal(e.p1.y,arena.floorY);
    assert.ok(e.p1.scale<0.75);
    for(const platform of arena.platforms){
      assert.ok(platform.x1>=0 && platform.x2<=960 && platform.x2>platform.x1);
      assert.ok(platform.y>100 && platform.y<arena.floorY);
      assert.equal(platform.type,'one_way');
    }
  }
});
test('landing on every elevated platform is solid; ascent never collides with underside',()=>{
  for(const id of newStages){
    for(const p of getLargeArena(id).platforms){
      const e=make(id);
      e.p1.x=(p.x1+p.x2)/2;
      e.p1.y=p.y+42;
      e.p1.vy=-15;
      e.p1.state='JUMP';
      e.p1.jumpsRemaining=0;
      let crossedAbove=false;
      for(let i=0;i<130;i++){
        tick(e);
        if(e.p1.y<p.y-3)crossedAbove=true;
        if(crossedAbove && Math.abs(e.p1.y-p.y)<0.5 && e.p1.vy===0)break;
      }
      assert.ok(crossedAbove,`${id}:${p.id} ascends through underside`);
      assert.equal(e.p1.y,p.y,`${id}:${p.id} lands precisely on top`);
      assert.equal(e.p1.vy,0);
      assert.equal(e.p1.jumpsRemaining,1);
    }
  }
});
test('DOWN+JUMP drops through platforms but never through the continuous floor',()=>{
  for(const id of newStages){
    const arena=getLargeArena(id);
    const p=arena.platforms[0];
    const e=make(id);
    e.p1.x=Math.min(p.x2-8,Math.max(p.x1+8,150));
    e.p1.y=p.y;
    e.p1.state='IDLE';
    e.p1.vy=0;
    e.p1Input.down=true;
    e.queueTouchJump();
    tick(e,6);
    assert.ok(e.p1.y>p.y+5,`${id} dropped below ${p.id}`);
    e.p1Input.down=false;
    tick(e,130);
    assert.equal(e.p1.y,arena.floorY,`${id} drops onto continuous floor`);
    e.queueTouchJump();e.p1Input.down=true;tick(e);
    assert.ok(e.p1.y<=arena.floorY,`${id} cannot drop through the ground`);
  }
});
test('classic arenas retain original sprite size and floor height',()=>{
  const e=make('SKI_RESORT');
  assert.equal(e.p1.y,472);
  assert.equal(e.p1.scale,1);
  assert.equal(getLargeArena('SKI_RESORT'),undefined);
});
test('training collision overlay and gentle camera zoom are only presentation controls',()=>{
  const e=make('SPIRIT_FOREST');
  assert.equal(e.showArenaCollisions,false);
  assert.equal(e.cameraZoom,1);
  assert.match(fs.readFileSync(path.join(root,'src/components/FightArena.tsx'),'utf8'),/mode === 'TRAINING' && !tutorial && <div className="arena-collision-tools">/);
  assert.match(fs.readFileSync(path.join(root,'src/engine/FightEngine.ts'),'utf8'),/const desiredZoom = sameSide && distance < 330/);
  assert.match(fs.readFileSync(path.join(root,'src/engine/FightEngine.ts'),'utf8'),/0\.1 \* Math\.max/);
});
test('online rematches switch map geometry and fighter scale as well as the background',()=>{
  const e=make('SPIRIT_FOREST');
  assert.equal(e.p1.y,453);
  e.setStage('SKI_RESORT');
  assert.equal(e.p1.y,472);
  assert.equal(e.p1.scale,1);
  e.setStage('VOLCANIC_FORTRESS');
  assert.equal(e.p1.y,436);
  assert.equal(e.p1.scale,0.64);
});
