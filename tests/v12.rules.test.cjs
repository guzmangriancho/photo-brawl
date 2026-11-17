'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {removeChromaBackground}=require('../server/runtime/engine/chromaKey.js');
const {FightEngine}=require('../server/runtime/engine/FightEngine.js');
const {PRESET_FIGHTERS}=(()=>{try{return require('../server/runtime/data/presetFighters.js')}catch{return {}}})();
function surface(){
  const width=16,height=16,data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4){data[i]=0;data[i+1]=255;data[i+2]=0;data[i+3]=255;}
  // Solid red body with a fully enclosed 3x3 chroma hole (arm gap).
  for(let y=2;y<=13;y++)for(let x=2;x<=13;x++){const i=(y*width+x)*4;data[i]=180;data[i+1]=32;data[i+2]=50;}
  for(let y=6;y<=8;y++)for(let x=6;x<=8;x++){const i=(y*width+x)*4;data[i]=0;data[i+1]=255;data[i+2]=0;}
  // Green shirt island should remain, since it isn't chroma-key pure green.
  for(let y=10;y<=12;y++)for(let x=8;x<=11;x++){const i=(y*width+x)*4;data[i]=45;data[i+1]=185;data[i+2]=65;}
  return {width,height,data};
}
test('chroma key cuts exterior AND enclosed arm hole but protects green clothing',()=>{
  const p=surface();removeChromaBackground(p,16);
  const alpha=(x,y)=>p.data[(y*16+x)*4+3];
  assert.equal(alpha(0,0),0,'green exterior is removed');
  assert.equal(alpha(7,7),0,'green enclosed hole must be removed');
  assert.equal(alpha(3,3),255,'opaque character remains');
  assert.equal(alpha(9,11),255,'green shirt remains');
});
function profile(name){return {fighterName:name,archetype:'SHOTO_BALANCED',passiveTrait:'FAST_METER_GAIN',stats:{hp:25,speed:25,power:25,technique:25},scaleMultiplier:1,moveset:{specialNeutral:{mechanic:'STRAIGHT_FIREBALL',primaryHex:'#0ff'}}};}
test('network projectile art is reconstructed from the owner rather than replaced with a circle',()=>{
  const e=new FightEngine(profile('A'),profile('B'),'1P_VS_2P','SKI_RESORT');
  const a={image:'A'},b={image:'B'};
  e.p1.spriteSheet=a;e.p2.spriteSheet=b;
  const wire=e.exportNetworkState();
  wire.frame=1;
  wire.projectiles=[{id:1,ownerIndex:1,x:200,y:200,mechanic:'STRAIGHT_FIREBALL',useSpriteArt:true}];
  e.applyNetworkState(wire);
  assert.equal(e.projectiles[0].spriteSheet,b);
  assert.equal(e.projectiles[0].useSpriteArt,true);
});
test('best of three keeps assets, announces round 2 and ends only on second win',()=>{
  const e=new FightEngine(profile('A'),profile('B'),'1P_VS_2P','SKI_RESORT');
  const img={image:'ready'};e.p1.spriteSheet=img;
  e.triggerKnockout(e.p1,e.p2);
  assert.equal(e.roundOver,false);
  assert.equal(e.p1RoundWins,1);
  assert.equal(e.roundNumber,1);
  for(let i=0;i<120;i++)e.step();
  assert.equal(e.roundNumber,2);assert.equal(e.roundIntroFrames,180);
  assert.equal(e.p1.spriteSheet,img,'resets must not call window.Image on Node');
  for(let i=0;i<180;i++)e.step();
  assert.equal(e.roundIntroFrames,0);
  e.triggerKnockout(e.p2,e.p1);
  assert.equal(e.roundOver,false);assert.equal(e.p2RoundWins,1);
  for(let i=0;i<300;i++)e.step();
  assert.equal(e.roundNumber,3);
  e.triggerKnockout(e.p1,e.p2);
  assert.equal(e.roundOver,true);
  assert.equal(e.winnerName,'A');
  assert.equal(e.p1RoundWins,2);assert.equal(e.p2RoundWins,1);
  e.resetRound();
  assert.equal(e.roundNumber,1);assert.equal(e.p1RoundWins,0);
  assert.equal(e.p2RoundWins,0);assert.equal(e.roundOver,false);
});
