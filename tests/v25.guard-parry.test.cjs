const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function loadTs(relative) {
  const filename = path.join(root, relative);
  const src = fs.readFileSync(filename,'utf8');
  const compiled = ts.transpileModule(src, {
    fileName: filename,
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const mod={exports:{}};
  const soundFX=new Proxy({}, {get:()=>()=>{}});
  const fakeVfx = new Proxy({}, {get:()=>()=>{}});
  vm.runInNewContext(compiled, {
    module:mod,exports:mod.exports,
    require:(id) => id.includes('cpuTactics')?require('./helpers/cpuTactics.cjs'):id.includes('SoundFX')?{soundFX}:id.includes('SpriteProcessor')?{loadImage:async()=>null}:id.includes('ArcadeVFX')?fakeVfx:id.includes('stages')?{STAGE_ART:{},getLargeArena:()=>undefined}:{},
    console,Math,Date,
  },{filename});
  return mod.exports;
}
const {FightEngine} = loadTs('src/engine/FightEngine.ts');
const {packControls,unpackControls} = loadTs('src/network/protocol.ts');
const moveSet = {
 lightNormal:{name:'JAB',style:'FAST_JAB'},heavyNormal:{name:'FINISHER',style:'LONG_ROUNDHOUSE'},
 specialNeutral:{name:'BOLA',mechanic:'STRAIGHT_FIREBALL',visualAction:'',primaryHex:'#40d9f5'},
 specialForward:{name:'SLIDE',mechanic:'SLIDE_LOW_KICK',visualAction:'',primaryHex:'#40d9f5'},
 specialUp:{name:'SHORYUKEN',mechanic:'INVINCIBLE_UPPERCUT',visualAction:'',primaryHex:'#40d9f5'},
 ultimateSuper:{name:'OMEGA',mechanic:'GIANT_BEAM_LASER',visualAction:'',primaryHex:'#40d9f5'},
};
const profile = name => ({id:name,fighterName:name,archetype:'SHOTO_BALANCED',stats:{hp:25,power:25,technique:25,speed:25},moveset:moveSet,passiveTrait:'NONE',spriteSheetDataUrl:'',portraitDataUrl:''});
function make(stage='SKI_RESORT') {
 const e=new FightEngine(profile('p1'),profile('p2'),'1P_VS_2P',stage);
 e.announceTimer=0;e.p1.x=410;e.p2.x=492;
 return e;
}
function step(e,n=1) {for(let j=0;j<n;j++)e.step();}

// New dedicated guard is independent of both movement direction and crouching.
test('guard requires GUARD input, not merely holding backwards or down', () => {
 const e=make();e.p1.x=260;e.p2.x=700;
 e.p1Input.left=true;step(e,3);
 assert.equal(e.p1.state,'WALK_BACK');
 e.p1Input.left=false;e.p1Input.down=true;step(e,1);
 assert.equal(e.p1.state,'CROUCH');
 e.p1Input.down=false;e.p1Input.guard=true;step(e,1);
 assert.equal(e.p1.state,'BLOCK_STAND');
 e.p1Input.down=true;step(e,1);
 assert.equal(e.p1.state,'BLOCK_CROUCH');
 e.p1Input.down=false;e.p1Input.guard=false;step(e,1);
 assert.equal(e.p1.state,'IDLE');
});

test('guarding lets player move toward and away from enemy without dropping defense', () => {
 const e=make();e.p1.x=260;e.p2.x=700;e.p1Input.guard=true;
 e.p1Input.right=true;const first=e.p1.x;step(e,5);
 assert.equal(e.p1.state,'BLOCK_STAND');assert.ok(e.p1.x>first,'walk forward while guarding');
 e.p1Input.right=false;e.p1Input.left=true;const second=e.p1.x;step(e,5);
 assert.equal(e.p1.state,'BLOCK_STAND');assert.ok(e.p1.x<second,'walk backward while guarding');
});

test('perfect guard of jab interrupts opponent, pushes backward, and produces a tiny pixel burst', () => {
 const e=make();e.queueTouchAction('LIGHT');step(e,3);
 const x=e.p1.x;e.p2Input.guard=true;step(e,1);
 assert.equal(e.p1.state,'HURT');
 assert.equal(e.p1.currentAttack,null);
 assert.ok(e.p1.vx<0,'knockback is away from the defender');
 assert.equal(e.p2.hp,e.p2.maxHp);
 assert.ok(e.parryBursts.length>0);
 assert.equal(e.parryBursts[0].life,15);
 step(e,16);assert.ok(e.p1.x<x-15);
});

test('held guard blocks a jab normally; no automatic parry', () => {
 const e=make();e.p2Input.guard=true;step(e,9);
 e.queueTouchAction('LIGHT');step(e,12);
 assert.equal(e.p2.hp,e.p2.maxHp);
 assert.ok(!e.parryBursts.length);
 assert.notEqual(e.p1.state,'HURT');
});

test('guard cannot be bypassed by attacks queued while holding it', () => {
 const e=make();e.p1Input.guard=true;
 e.queueTouchAction('LIGHT');step(e,5);
 assert.equal(e.p1.state,'BLOCK_STAND');
 assert.equal(e.p1.bufferedActions.length,0);
 e.p1Input.guard=false;step(e,3);
 assert.notEqual(e.p1.state,'ATTACK');
});

test('second jab has less hitstun and third normal creates an escape gap', () => {
 const e=make();e.queueTouchAction('LIGHT');step(e,1);
 e.queueTouchAction('LIGHT');step(e,16);
 assert.ok(e.p1.lightChainCount>=2);
 assert.ok(e.p2.hitstunFrames<=9,'second jab grants a shorter stun');
 e.queueTouchAction('LIGHT');step(e,16);
 assert.ok(e.p1.comboCount>=3,'existing A+A+finisher combo survives');
 assert.ok(e.p2.hitstunFrames<=7,'finisher cannot hold victim in continuous normal hitstun');
});

test('one projectile at a time with real cooldown, including cancel-to-special paths', () => {
 const e=make();e.p1.x=210;e.p2.x=750;
 let peak=0;
 for (let i=0;i<160;i++) {
   if(i%6===0)e.queueTouchAction('SP_NEUTRAL');
   step(e);
   peak=Math.max(peak,e.projectiles.filter(p=>p.ownerIndex===0).length);
 }
 assert.equal(peak,1,'a spammer can never stack projectiles');
 assert.ok(e.p1.projectileCooldownFrames>=0);
});

test('server wire control bit includes guard, remains separate from attacks', () => {
 const input={left:true,right:false,up:false,down:false,light:false,heavy:false,spNeutral:false,spForward:false,spUp:false,superBtn:false,romanCancel:false,dashLeft:false,dashRight:false,guard:true};
 const mask=packControls(input);
 assert.equal(mask & (1<<13),1<<13);
 assert.equal(mask & 15,1);
 assert.equal(unpackControls(mask).guard,true);
 assert.equal(unpackControls(0).guard,false);
 const code=fs.readFileSync(path.join(root,'server/rooms.cjs'),'utf8');
 assert.match(code,/player\.mask=msg\.mask & \(0b1111 \| \(1 << 13\)\)/);
});

test('parry effect and cooldown are synchronized by online snapshot', () => {
 const server=make();server.queueTouchAction('LIGHT');step(server,3);
 server.p2Input.guard=true;step(server);
 const wire=JSON.parse(JSON.stringify(server.exportNetworkState()));
 assert.equal(wire.parryBursts.length,1);
 assert.equal(typeof wire.p1.projectileCooldownFrames,'number');
 const client=make();client.applyNetworkState(wire);
 assert.equal(client.p1.state,'HURT');
 assert.equal(client.parryBursts.length,1);
 assert.equal(client.parryBursts[0].life,15);
});

test('mobile touch controls and keyboard each expose an independent guard button', () => {
 const m=fs.readFileSync(path.join(root,'src/components/MobileControls.tsx'),'utf8');
 const a=fs.readFileSync(path.join(root,'src/components/FightArena.tsx'),'utf8');
 const fx=fs.readFileSync(path.join(root,'src/engine/ArcadeVFX.ts'),'utf8');
 assert.match(m,/mobile-guard/);assert.match(m,/inputRef\.current\.guard = true/);
 assert.match(m,/aria-pressed=\{Boolean\(pressed\.guard\)\}/);
 assert.match(a,/KeyQ: 'guard'/);assert.match(a,/KeyN: 'guard'/);
 assert.match(fx,/imageSmoothingEnabled = false/);
 assert.match(fx,/drawPixelSuper\(ctx, fx =>/);
 assert.match(fx,/drawParryBurstFX/);
});

test('jab mashing stops dealing damage once defender can raise guard after the first hit', () => {
 const e=make();
 e.queueTouchAction('LIGHT');step(e,4);
 assert.ok(e.p2.hp<e.p2.maxHp,'first jab really connected');
 e.p2Input.guard=true;
 for(let frame=0;frame<190;frame++) {
   if(frame%7===0)e.queueTouchAction('LIGHT');
   step(e);
 }
 assert.ok(e.p2.hp>e.p2.maxHp-120,'no permanent jab hit-stun loop');
 assert.ok(e.p2.state==='BLOCK_STAND' || e.p2.state==='IDLE',`defender can act, got ${e.p2.state}`);
});

test('projectiles are guardable while walking forward; blocking prevents full damage', () => {
 const e=make();e.p1.x=240;e.p2.x=620;
 e.p2Input.guard=true;e.p2Input.left=true;
 const hp=e.p2.hp;
 e.queueTouchAction('SP_NEUTRAL');step(e,85);
 assert.ok(e.p2.hp>=hp-20,'blocking a projectile costs only small chip');
 assert.equal(e.p2.state,'BLOCK_STAND');
});

test('crouch guard protects against low normals and high guard does not', () => {
 const a=make();a.p2Input.guard=true;a.p2Input.down=true;
 a.queueTouchAction('LOW');step(a,10);
 assert.ok(a.p2.maxHp-a.p2.hp<=12,'crouch guard only takes chip damage');
 const b=make();b.p2Input.guard=true;
 b.queueTouchAction('LOW');step(b,10);
 assert.ok(b.p2.maxHp-b.p2.hp>12,'low gets past a standing block');
});

test('short shotgun blast is also rate limited', () => {
 const e=make(); e.p1.profile.moveset.specialNeutral.mechanic='SHORT_SHOTGUN_BLAST';
 e.p1.x=200;e.p2.x=770;
 e.queueTouchAction('SP_NEUTRAL');step(e,10);
 assert.ok(e.p1.projectileCooldownFrames>=43);
 e.queueTouchAction('SP_NEUTRAL');step(e,23);
 assert.notEqual(e.p1.currentAttack?.slot,'SP_NEUTRAL','cannot restart shotgun during cooldown');
});
