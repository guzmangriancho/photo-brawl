'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');
function loadService(file,mocks){
  const sourceText=source(file);
  const result=ts.transpileModule(sourceText,{fileName:file,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
  const errors=result.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error)||[];
  assert.equal(errors.length,0,`Parse error in ${file}`);
  const module={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${result.outputText}\n})`,{})(k=>{
    if(!(k in mocks))throw new Error(`Unexpected import ${k} from ${file}`);
    return mocks[k];
  },module,module.exports);
  return module.exports;
}
const design={
 fighterName:'OMEGA REX',subtitle:'DESPERTAR',archetype:'RUSHDOWN',passiveTrait:'AIR_DASH',
 stats:{hp:25,speed:27,power:26,technique:22},traitDescription:'Velocidad y fuego',
 moveset:{
 lightNormal:{name:'GOLPE SOLAR',style:'FAST_JAB'},heavyNormal:{name:'RUGIDO',style:'SWEEP_TRIP'},
 specialNeutral:{name:'FUEGO DORADO',mechanic:'STRAIGHT_FIREBALL',visualAction:'Gold fire',primaryHex:'#FFD700'},
 specialForward:{name:'EMBESTIDA',mechanic:'SPINNING_ADVANCE',visualAction:'Dash'},
 specialUp:{name:'REMOLINO',mechanic:'HIGH_LEAP_STOMP',visualAction:'Leap'},
 ultimateSuper:{name:'OMEGA',mechanic:'GIANT_BEAM_LASER',visualAction:'Beam'},
 },visualDescriptionForSprite:'Bright aura and gold sparks',
 animationDirection:{stanceStyle:'guard',light:{attackType:'PUNCH',strikingLimb:'RIGHT_FIST',windupAction:'load',activeAction:'punch'},heavy:{attackType:'KICK',strikingLimb:'LEFT_FOOT',windupAction:'bend',activeAction:'kick'}},
};
const base={...design,fighterName:'RUINA REX',stats:{hp:25,speed:25,power:25,technique:25},
 id:'custom_123',isPreset:false,createdAt:1700000000000,
 portraitDataUrl:'data:image/png;base64,YWJj',spriteSheetDataUrl:'data:image/png;base64,YWJj'};
const prompt=loadService('src/services/ultimatePrompts.ts',{'../i18n':{getLang:()=>'es'},'./geminiFighterGenerator':{parseFighterDesignJson:d=>d}});
test('Unlocked when 1000 historical cups or 15 wins; no drops after losing trophies',()=>{
  assert.equal(prompt.ultimateUnlocked(null),false);
  assert.equal(prompt.ultimateUnlocked({best_trophies:999,wins:14}),false);
  assert.equal(prompt.ultimateUnlocked({best_trophies:1000,wins:0}),true);
  assert.equal(prompt.ultimateUnlocked({best_trophies:0,wins:15}),true);
});
test('No pay-to-win: max 100 points, same archetype/trait/mechanics and attack limb',()=>{
  assert.equal(prompt.validateUltimateJson(base,design).fighterName,'OMEGA REX');
  const bad=JSON.parse(JSON.stringify(design));bad.stats.hp+=5;
  assert.throws(()=>prompt.validateUltimateJson(base,bad),/exactamente 100/);
  const different=JSON.parse(JSON.stringify(design));different.moveset.specialNeutral.mechanic='TRAP_MINE_DROP';
  assert.throws(()=>prompt.validateUltimateJson(base,different),/debe conservar/);
  const limb=JSON.parse(JSON.stringify(design));limb.animationDirection.light.strikingLimb='LEFT_FIST';
  assert.throws(()=>prompt.validateUltimateJson(base,limb),/miembro/);
  const passive=JSON.parse(JSON.stringify(design));passive.passiveTrait='DOUBLE_JUMP';
  assert.throws(()=>prompt.validateUltimateJson(base,passive),/arquetipo y la pasiva/);
});
test('Prompts attach base art and preserve 4x4 1024 green-screen and sprite layout',()=>{
  assert.match(prompt.buildUltimateBrief(base),/RETRATO BASE/);
  assert.match(prompt.buildUltimateBrief(base),/100 puntos/);
  assert.match(prompt.buildUltimateSheetPrompt(base,design),/1024x1024/);
  assert.match(prompt.buildUltimateSheetPrompt(base,design),/CELL 15/);
  assert.match(prompt.buildUltimateSheetPrompt(base,design),/#00FF00/);
  assert.match(prompt.buildUltimatePortraitPrompt(base,design),/512x512/);
});
test('Variant keeps original local ID and image unchanged',()=>{
  const {applyUltimate}=loadService('src/services/ultimateForms.ts',{
    './supabaseClient':{supabase:null},'./communityService':{cloudEntry(){},fighterPublicUrl(){}},'./ultimatePrompts':prompt,
  });
  const before=JSON.stringify(base);
  const evolved=applyUltimate(base,{design,portraitDataUrl:'data:image/png;base64,bmV3',spriteSheetDataUrl:'data:image/png;base64,bmV3'});
  assert.equal(evolved.id,base.id);
  assert.equal(evolved.ultimateForm,true);
  assert.equal(evolved.stats.hp,25);
  assert.equal(evolved.fighterName,'OMEGA REX');
  assert.equal(JSON.stringify(base),before);
});
test('Server preserves Ultimate flag after sanitizing a playable 100-point profile',()=>{
  const {validateProfile}=require(path.join(root,'server/validation.cjs'));
  const fighter=validateProfile({...base,ultimateForm:true});
  assert.equal(fighter?.ultimateForm,true);
  assert.equal(fighter?.id,base.id);
  assert.equal(validateProfile({...base,stats:{hp:30,speed:25,power:25,technique:25}}),null);
});
test('Ranked server validates saved Ultimate instead of accepting a client-provided unlock',async()=>{
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY='test';
  process.env.SUPABASE_SECRET_KEY='sb_secret_fake';
  const service=require(path.join(root,'server/ranked.cjs'));
  const old=global.fetch;
  const calls=[];
  try{
    global.fetch=async url=>{
      calls.push(String(url));
      return {ok:true,json:async()=>String(url).includes('/fighter_ultimate_forms?')? [{design}]: [{id:'b10fd36e-bee5-48ad-9493-cbbf4001abc2',fighter_data:base}]};
    };
    await service.verifyRankedFighter('a3336dba-534d-44b3-b610-98d19461009a',{...base,...design,ultimateForm:true});
    assert.equal(calls.length,2);
    assert.match(calls[1],/fighter_ultimate_forms/);
    await assert.rejects(service.verifyRankedFighter('a3336dba-534d-44b3-b610-98d19461009a',{...base,...design,stats:{hp:35,speed:27,power:26,technique:22},ultimateForm:true}),/no coinciden/);
  }finally{global.fetch=old;}
});
test('Supabase milestone + RLS and verified server integration included',()=>{
  const sql=source('supabase/migrations/202611190004_v57_ultimate_awakenings.sql');
  assert.match(sql,/best_trophies<1000 AND pr.wins<15/);
  assert.match(sql,/ALTER TABLE public.fighter_ultimate_forms ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/SECURITY DEFINER/);
  assert.match(sql,/REVOKE ALL ON public.fighter_ultimate_forms/);
  assert.match(sql,/Ultimate no permite más de 100 puntos/);
  assert.match(sql,/CREATE TRIGGER pb_hide_ultimate_on_change/);
  const c=source('src/components/CharacterSelect.tsx');
  assert.match(c,/UltimateWorkshop/);assert.match(c,/pb-awaken-switch/);
  const rank=source('server/ranked.cjs');
  assert.match(rank,/profile.ultimateForm===true/);
  assert.match(source('server/rooms.cjs'),/player.profile.ultimateForm/);
  assert.match(source('server/group-rooms.cjs'),/profile.ultimateForm/);
});
