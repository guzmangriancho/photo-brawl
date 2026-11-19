'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('creator imports sprite and portrait from files, not image clipboard',()=>{
  const ui=read('src/components/FighterCreator.tsx');
  assert.match(ui,/importImage\(artStep,e\.target\.files\?\.\[0\]\)/);
  assert.match(ui,/accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(ui,/SUBIR IMAGEN/);
  assert.doesNotMatch(ui,/PEGAR IMAGEN|pasteArt\(|onArtPaste\(|imagePasteFallback|imagePasteTarget|pb-creator-image-paste/);
  assert.match(ui,/desc[aá]rgala|Descarga la imagen|Descarga el archivo/i,'Creator guide explains file download');
  assert.match(ui,/await navigator\.clipboard\.readText\(\)/,'Text/JSON paste for character design is still present');
  assert.match(ui,/navigator\.clipboard\.writeText\(value\)/,'Copy AI prompts still works');
  assert.match(read('src/components/fighterCreator.css'),/\.pb-creator-image-actions\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.doesNotMatch(read('src/components/fighterCreator.css'),/\.pb-creator-image-paste-/);
});

test('4-player pre-fight countdown uses the exact duel announcement frame and typography',()=>{
  const group=read('src/components/GroupFightArena.tsx');
  const duel=read('src/components/FightArena.tsx');
  const groupCss=read('src/components/groupFightArena.css');
  assert.match(duel,/className="arena-announcement"/);
  assert.match(group,/className="pb-group-countdown"[\s\S]*?<div className="arena-announcement">/);
  assert.match(group,/RONDA 1 · \$\{summary\.countdown\}/);
  assert.match(group,/summary\.countdown==='YA'\?'¡FIGHT!'/);
  assert.match(groupCss,/\.pb-group-countdown \.arena-announcement > span/);
  assert.doesNotMatch(groupCss,/\.pb-group-countdown > span/,'No separate font or panel replaces the 1v1 overlay');
  assert.match(groupCss,/@media \(prefers-reduced-motion:reduce\)/);
});

test('group K.O. and victory reuse the duel font and result panel',()=>{
  const group=read('src/components/GroupFightArena.tsx');
  const duelCss=read('src/components/fightArena.css');
  const groupCss=read('src/components/groupFightArena.css');
  assert.match(group,/className="arena-victory-moment pb-victory-moment"/);
  assert.match(group,/className="arena-win-second"/);
  assert.match(group,/className="pb-ko-moment"/);
  assert.match(duelCss,/\.arena-ko-first, \.pb-ko-moment strong/);
  assert.match(duelCss,/\.arena-victory-moment span, \.pb-ko-moment span/);
  assert.doesNotMatch(groupCss,/\.pb-ko-moment strong\s*\{/,'The KO headline font is no longer overridden');
  assert.doesNotMatch(groupCss,/\.pb-victory-moment strong\s*\{[^}]*font:/,'Winner typography no longer overrides 1v1');
});

test('pixel font is actually requested and legible digits remain arcade-styled',()=>{
  const html=read('index.html');
  assert.match(html,/family=Press\+Start\+2P/);
  assert.match(read('src/components/arcadeMenus.css'),/\.pb-team-digit\{font-family:'Pixelify Sans'/);
  assert.match(read('src/components/groupFightArena.css'),/\.pb-team-digit \{ font: 700 13px\/1 'Pixelify Sans'/);
  assert.match(read('public/sw.js'),/pb-shell-v50-arcade-overlay-style/);
});

test('modified TSX files have zero parser errors',()=>{
  const ts=require('typescript');
  for(const name of ['src/components/FighterCreator.tsx','src/components/GroupFightArena.tsx']){
    const tree=ts.createSourceFile(name,read(name),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    assert.equal(tree.parseDiagnostics.length,0,`${name}: ${tree.parseDiagnostics.map(x=>x.messageText).join(' / ')}`);
  }
});
