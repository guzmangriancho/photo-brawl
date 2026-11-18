const fs=require('fs');
const ts=require('typescript');
const path=require('node:path').join(__dirname,'../src/engine/FightEngine.ts');
const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const vm=require('vm');
const soundFX=new Proxy({muted:true},{get:(t,p)=>p==='muted'?t.muted:()=>{}});
const mod={exports:{}};
vm.runInNewContext(js,{module:mod,exports:mod.exports,require:(id)=>id.includes('SoundFX')?{soundFX}:id.includes('SpriteProcessor')?{loadImage:async()=>null}:id.includes('stages')?{STAGE_ART:{},getLargeArena:()=>undefined}:null,console,Math,Date}, {filename:'FightEngine.js'});
const {FightEngine}=mod.exports;
const moveset={lightNormal:{name:'PUÑO',style:'FAST_JAB'},heavyNormal:{name:'GOLPE',style:'LONG_ROUNDHOUSE'},specialNeutral:{name:'BOLA',mechanic:'STRAIGHT_FIREBALL',visualAction:'',primaryHex:'#40d9f5'},specialForward:{name:'IMPULSO',mechanic:'SLIDE_LOW_KICK',visualAction:''},specialUp:{name:'SHORYUKEN',mechanic:'INVINCIBLE_UPPERCUT',visualAction:''},ultimateSuper:{name:'OMEGA',mechanic:'GIANT_BEAM_LASER',visualAction:''}};
const profile=(name)=>({id:name,fighterName:name,archetype:'SHOTO_BALANCED',stats:{hp:25,power:25,technique:25,speed:25},moveset,passiveTrait:'DOUBLE_JUMP',portraitDataUrl:'',spriteSheetDataUrl:''});
const make=(mode='TRAINING')=>{let e=new FightEngine(profile('p1'),profile('p2'),mode,'SKI_RESORT');e.announceTimer=0; e.p1.x=410; e.p2.x=492;return e};
let checks=0;function assert(val,msg){if(!val) throw Error('FAIL: '+msg);checks++};
function tick(e,n=1){for(let i=0;i<n;i++)e.step()}
// Test 1: repeated actions aren't merged when pressed between RAF frames; A+A+A should reach HEAVY.
{
 let e=make();e.queueTouchAction('LIGHT');tick(e,1);
 assert(e.p1.currentAttack?.slot==='LIGHT','first attack light begins');
 e.queueTouchAction('LIGHT');tick(e,16);
 const second=e.p1.currentAttack?.slot;
 assert(e.p1.lightChainCount>=2,'second light cancel is chained on connect (now '+second+')');
 e.queueTouchAction('LIGHT');tick(e,16);
 assert(e.p1.currentAttack?.slot==='HEAVY' || (e.p1.currentAttack?.slot==='SP_NEUTRAL'), 'third A becomes heavy finisher, got '+e.p1.currentAttack?.slot);
 assert(e.p1.comboCount>=3, 'third A actually connects; not just plays a heavy animation');
 console.log('A+A+A ->',e.p1.currentAttack?.slot,'p1 combo count',e.p1.comboCount,'p2 hp',e.p2.hp);
}
// Test 2: tap tap hold enqueues heavy directly, never a double light.
{
 let e=make(); e.queueTouchAction('LIGHT');tick(e,1);e.queueTouchAction('LIGHT');tick(e,16);
 e.queueTouchAction('HEAVY');tick(e,15);
 assert(e.p1.currentAttack?.slot==='HEAVY','tap tap hold -> heavy');
 console.log('A+A+HOLD ->',e.p1.currentAttack.slot);
}
// Test 3: chained technique is possible after confirmed light.
{
 let e=make(); e.queueTouchAction('LIGHT');tick(e,1);e.queueTouchAction('SP_FORWARD');tick(e,12);
 assert(e.p1.currentAttack?.slot==='SP_FORWARD','light > technique cancel');
 console.log('A+B forward ->',e.p1.currentAttack.slot);
}
// Test 4: guard release doesn't leave player in blockstun / block animation.
{
 let e=make();e.p1.x=260;e.p2.x=700;e.p1Input.left=true;tick(e,4);e.p1Input.left=false;tick(e,2);
 assert(e.p1.state==='IDLE','holding back and releasing -> idle, got '+e.p1.state);
 console.log('guard release ->',e.p1.state);
}
// Test 5: Flick creates one dash.
{
 let e=make();e.queueTouchDash(1);tick(e);
 assert(e.p1.state==='DASH','flick triggers dash');
 console.log('flick ->',e.p1.state,e.p1.vx);
}
// Test 6: Super can't trigger without charge and costs 100 when ready.
{
 let e=make('1P_VS_2P');e.p1.meter=40;e.queueTouchAction('SUPER');tick(e);
 assert(e.p1.currentAttack?.slot!=='SUPER','cannot perform empty super');
 e.p1.meter=100;e.queueTouchAction('SUPER');tick(e);
 assert(e.p1.currentAttack?.slot==='SUPER','ready super executes');
 assert(e.p1.meter===0,'super costs all energy');
 console.log('super -> ready only, meter now',e.p1.meter);
}
// Test 7: action during hitstop preserved.
{
 let e=make();e.queueTouchAction('LIGHT');for(let i=0;i<10 && e.hitstopFrames===0;i++) tick(e);assert(e.hitstopFrames>0,'impact causes hitstop');
 e.queueTouchAction('LIGHT');tick(e,6);
 assert(e.p1.currentAttack?.slot==='LIGHT' && e.p1.lightChainCount===2,'buffered during hitstop');
 console.log('hitstop buffered -> chain count',e.p1.lightChainCount);
}
// Test 8: UI signal uses confirmed hits only (no misleading combo prompt on a whiff).
{
 let e=make();e.queueTouchAction('LIGHT');tick(e,9);
 assert(e.getSnapshot().p1ChainStep===1,'UI reports first confirmed light');
 e.queueTouchAction('LIGHT');tick(e,16);
 assert(e.getSnapshot().p1ChainStep===2,'UI reports the second confirmed hit');
 let far=make();far.p2.x=800;far.queueTouchAction('LIGHT');tick(far,8);
 assert(far.getSnapshot().p1ChainStep===0,'UI does not prompt on a whiff');
}
// Test 9: entering pause clears queued actions and dash (a buffered move must not fire on resume).
{
 let e=make();e.queueTouchAction('HEAVY');e.queueTouchDash(1);e.clearBufferedCommands();tick(e);
 assert(e.p1.state!=='ATTACK' && e.p1.state!=='DASH','pause clears buffered inputs');
 assert(e.p1.bufferedActions.length===0 && !e.p1.bufferedDash,'buffers empty');
}
// Test 10: confirmed heavy can cancel into B, giving a satisfying four-part string.
{
 let e=make();e.queueTouchAction('LIGHT');tick(e,1);
 e.queueTouchAction('LIGHT');tick(e,16);
 e.queueTouchAction('LIGHT');tick(e,16);
 assert(e.p1.currentAttack?.slot==='HEAVY' && e.p1.currentAttack.hasHit,'heavy finisher has made contact');
 e.queueTouchAction('SP_FORWARD');tick(e,2);
 assert(e.p1.currentAttack?.slot==='SP_FORWARD','A+A+A+B links into a forward technique');
}
console.log('PASS',checks,'assertions');
// Test 11: a dedicated touch jump works even if press/release happens between frames.
// A regular fighter must NOT receive a second air jump.
{
 const noDouble={...profile('single-jump'),passiveTrait:'NONE'};
 const e=new FightEngine(noDouble,profile('opponent'),'TRAINING','SKI_RESORT');
 e.announceTimer=0;e.p1.x=280;e.p2.x=740;
 assert(e.p1.jumpsRemaining===1,'non-DOUBLE_JUMP begins with exactly one jump');
 e.queueTouchJump();tick(e,1);
 assert(e.p1.jumpsRemaining===0 && e.p1.y<472,'dedicated jump responds to press without holding up');
 const vy=e.p1.vy;
 e.queueTouchJump();tick(e,1);
 assert(e.p1.jumpsRemaining===0,'regular fighter cannot gain second jump by tapping');
 assert(e.p1.vy>vy,'regular fighter preserves gravity, no second upward impulse');
}
// Test 12: double jump is a CHARACTER TRAIT, not a universal movement mechanic.
{
 let e=make();
 assert(e.p1.jumpsRemaining===2,'DOUBLE_JUMP fighter begins with two jumps');
 e.queueTouchJump();tick(e);
 const firstJumpVy=e.p1.vy;
 e.queueTouchJump();tick(e);
 assert(e.p1.jumpsRemaining===0,'trait fighter consumes second jump');
 assert(e.p1.vy<firstJumpVy+0.1,'trait fighter gets a second upward impulse');
 e.queueTouchJump();tick(e);
 assert(e.p1.jumpsRemaining===0,'trait fighter has no third jump');
 for(let i=0;i<120;i++)tick(e);
 assert(e.p1.jumpsRemaining===2,'jump charges restored on landing only for double jump trait');
}
// Test 13: two new directional A variants have distinct moves and hit heights.
{
 let e=make();e.queueTouchAction('LOW');tick(e);
 assert(e.p1.currentAttack?.slot==='LOW' && e.p1.currentAttack.height==='LOW','down+A is a low opener');
 e=make();e.queueTouchAction('RUSH');tick(e);
 assert(e.p1.currentAttack?.slot==='RUSH' && e.p1.currentAttack.hitbox.width>90,'forward+A is a range-extended advance opener');
}
console.log('PASS V5',checks,'assertions including trait-specific double jump');
