const {test}=require('node:test');
const assert=require('node:assert/strict');
const VFX=require('../server/runtime/engine/ArcadeVFX.js');

function fakeContext(){
  const calls={fills:0,strokes:0,rects:0,arcs:0,images:0};
  const ctx={calls,
    save(){},restore(){},translate(){},scale(){},rotate(){},
    beginPath(){},moveTo(){},lineTo(){},closePath(){},quadraticCurveTo(){},
    arc(){calls.arcs++},fill(){calls.fills++},stroke(){calls.strokes++},
    fillRect(){calls.rects++},strokeRect(){calls.rects++},drawImage(){calls.images++},
  };
  return ctx;
}
function fighter(slot, mechanic, changes={}){
  return {
    x:220,y:472,facing:1,state:'ATTACK',stateFrame:16,
    blockstunFrames:8,hurtbox:{width:67,height:140},
    profile:{moveset:{specialNeutral:{primaryHex:'#34d9fa'}}},
    currentAttack:{slot,mechanic,startup:4,active:32},
    ...changes
  };
}
const supers=['GIANT_BEAM_LASER','MULTI_HIT_RUSH_COMBO','METEOR_SCREEN_DROP','OMEGA_SUPLEX'];
for(const mechanic of supers){
  test('Super '+mechanic+' draws shaped effects without attack rectangles',()=>{
    const f=fighter('SUPER',mechanic);
    const before=JSON.stringify(f);
    const ctx=fakeContext();
    VFX.drawAttackFX(ctx,f,139);
    assert.equal(JSON.stringify(f),before,'rendering should never change the authoritative fighter');
    assert.equal(ctx.calls.rects,0,'no square attack overlays');
    assert.ok(ctx.calls.fills+ctx.calls.strokes>=4,'specialized multi-layer effect');
  });
}
for(const mechanic of ['SHORT_SHOTGUN_BLAST','SLIDE_LOW_KICK','SPINNING_ADVANCE','ARMORED_SHOULDER_DASH','COMMAND_GRAB_SLAM','VERTICAL_TORNADO','INVINCIBLE_UPPERCUT','DIVE_KICK_FROM_AIR','TELEPORT_BEHIND']){
  const slot=mechanic==='SHORT_SHOTGUN_BLAST'?'SP_NEUTRAL':
    ['VERTICAL_TORNADO','INVINCIBLE_UPPERCUT','DIVE_KICK_FROM_AIR'].includes(mechanic)?'SP_UP':'SP_FORWARD';
  test('Special '+mechanic+' draws no hitbox rectangle',()=>{
    const ctx=fakeContext();
    VFX.drawAttackFX(ctx,fighter(slot,mechanic),40);
    assert.equal(ctx.calls.rects,0);
    assert.ok(ctx.calls.fills+ctx.calls.strokes>0);
  });
}
test('Standing and crouching guard are curved and have no rectangular shield',()=>{
  for(const state of ['BLOCK_CROUCH','BLOCK_STAND']){
    const ctx=fakeContext();
    VFX.drawGuardFX(ctx,fighter('LIGHT','FAST_JAB',{state}),77);
    assert.equal(ctx.calls.rects,0);
    assert.ok(ctx.calls.strokes>0);
  }
});
test('Impact particle shapes fade without mutating synchronized state',()=>{
  const particles=[{x:450,y:210,vx:5,vy:-2,size:7,color:'#ffe2a1',life:18,maxLife:22,kind:'spark'},
    {x:500,y:410,vx:-2,vy:-1,size:5,color:'#fff',life:12,maxLife:16,kind:'dust'},
    {x:320,y:400,vx:1,vy:0,size:7,color:'#0ff',life:8,maxLife:10,kind:'energy'}];
  const serialized=JSON.stringify(particles);
  const ctx=fakeContext();
  VFX.drawParticlesFX(ctx,particles);
  VFX.drawHitstopSparkFX(ctx,particles,7);
  assert.equal(JSON.stringify(particles),serialized);
  assert.ok(ctx.calls.fills>4);
  assert.equal(ctx.calls.rects,0);
});
test('Super activation uses a single screen dimmer and non-rectangular radial effects',()=>{
  const ctx=fakeContext();
  VFX.drawSuperFlashFX(ctx,fighter('SUPER','GIANT_BEAM_LASER'),14,40);
  assert.equal(ctx.calls.rects,1);
  assert.ok(ctx.calls.fills+ctx.calls.strokes>25);
});
test('Projectile and ring effects are not blank rectangles',()=>{
  const ctx=fakeContext();
  VFX.drawProjectileFX(ctx,{x:440,y:240,vx:8,vy:0,mechanic:'STRAIGHT_FIREBALL',radius:24,color:'#22d3ee'},45);
  VFX.drawProjectileFX(ctx,{x:470,y:450,vx:0,vy:0,mechanic:'GROUND_SHOCKWAVE',radius:30,color:'#ef4444'},48);
  VFX.drawProjectileFX(ctx,{x:470,y:400,vx:0,vy:0,mechanic:'TRAP_MINE_DROP',radius:30,color:'#ef4444',armed:true},48);
  VFX.drawShockwaveFX(ctx,{x:450,y:360,radius:80,color:'#ffffff',alpha:.6},50);
  assert.equal(ctx.calls.rects,0);
  assert.ok(ctx.calls.fills+ctx.calls.strokes>20);
});
