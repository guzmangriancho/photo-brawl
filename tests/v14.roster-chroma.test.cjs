'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function loadPureTS(file){
  const input=fs.readFileSync(path.join(root,file),'utf8');
  const output=ts.transpileModule(input,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports={};
  vm.runInNewContext(output,{exports,Uint8Array,Uint8ClampedArray,Int32Array,Math,console});
  return exports;
}
const {removeChromaBackground}=loadPureTS('src/engine/chromaKey.ts');
function bitmap(){
  const width=20,height=20,data=new Uint8ClampedArray(width*height*4);
  const fill=(x,y,r,g,b,a=255)=>{const p=(y*width+x)*4;data[p]=r;data[p+1]=g;data[p+2]=b;data[p+3]=a;};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)fill(x,y,0,255,0);
  // Solid fighter with a bright green ring around it and an arm-gap hole.
  for(let y=3;y<17;y++)for(let x=3;x<17;x++)fill(x,y,162,51,63);
  for(let x=3;x<17;x++){fill(x,3,35,228,26);fill(x,16,35,228,26);}
  for(let y=3;y<17;y++){fill(3,y,35,228,26);fill(16,y,35,228,26);}
  for(let y=8;y<11;y++)for(let x=8;x<11;x++)fill(x,y,0,255,0);
  // Green garment inside a silhouette must not be blanket-erased.
  for(let y=12;y<15;y++)for(let x=7;x<11;x++)fill(x,y,55,171,62);
  return {width,height,data};
}
test('V14 chroma: removes both enclosed background and strong green halo, not clothing',()=>{
  const p=bitmap();removeChromaBackground(p,20);
  const pixel=(x,y)=>p.data.slice((y*20+x)*4,(y*20+x)*4+4);
  assert.equal(pixel(0,0)[3],0,'external green background');
  assert.equal(pixel(9,9)[3],0,'green hole');
  assert.equal(pixel(3,5)[3],0,'green line on contour');
  assert.equal(pixel(4,5)[3],255,'red silhouette preserved');
  assert.equal(pixel(8,13)[3],255,'green garment preserved');
});
test('V14 menu shows precisely 3 play modes, keeps four presets in tutorial only',()=>{
  const menu=fs.readFileSync(path.join(root,'src/components/CharacterSelect.tsx'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
  const block=menu.match(/const GAME_MODES:[\s\S]+?const STAT_FIELDS/)[0];
  const modes=Array.from(block.matchAll(/id:\s*'([^']+)'/g),m=>m[1]);
  assert.deepEqual(modes,['1P_VS_CPU','TRAINING','ONLINE']);
  assert.ok(menu.includes('const TUTORIAL_FIGHTERS = getPresetFighters()'));
  assert.ok(menu.includes('onStartTutorial(tutorialFighter.id)'));
  assert.ok(menu.includes("if (page !== 'HOME') return;"));
  assert.ok(menu.includes("if (!featured) { openCreator(); return; }"));
  assert.ok(app.includes('setFighters(customs.filter'));
  assert.ok(app.includes('if (p1.isPreset || p2.isPreset) return'));
  assert.ok(app.includes("tutorial:true"));
});
test('V14 new profiles and migrated profiles use chroma version 3',()=>{
  const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
  const generator=fs.readFileSync(path.join(root,'src/services/geminiFighterGenerator.ts'),'utf8');
  assert.match(app,/spriteSheetKeyVersion:3/);
  assert.match(generator,/spriteSheetKeyVersion:\s*3/);
});
