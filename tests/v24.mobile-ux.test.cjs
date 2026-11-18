'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=(()=>{try{return require('typescript');}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');}})();
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('online room only reveals the fighter roster after touching own avatar',()=>{
  const room=read('src/components/OnlineLobby.tsx');
  assert.match(room,/className="pb-online-player-avatar is-mine"/);
  assert.match(room,/onClick=\{\(\)=>\{setFighterPage\(0\);setPickerOpen\(true\);\}\}/);
  assert.match(room,/\{pickerOpen && canChangeFighter &&/);
  assert.match(room,/\.slice\(Math\.min\(fighterPage,fighterPageCount-1\)\*6/);
  assert.match(room,/aria-label="Página siguiente"/);
  assert.doesNotMatch(room,/className="pb-online-fighter-picker"/);
});
test('arena choices and room sheet stay inside mobile viewport',()=>{
  const css=read('src/components/online.css');
  assert.match(css,/max-height:calc\(100dvh/);
  assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css,/\.pb-online-picker-shade\{position:absolute;inset:0/);
});
test('sprite sheet and portrait accept both upload and image paste',()=>{
  const creator=read('src/components/FighterCreator.tsx');
  assert.match(creator,/navigator\.clipboard\?\.read/);
  assert.match(creator,/await item\.getType\(type\)/);
  assert.match(creator,/onPaste=\{e=>onArtPaste\(e,imagePasteFallback\)\}/);
  assert.match(creator,/pb-creator-image-actions/);
  assert.match(creator,/SUBIR IMAGEN/);
  assert.match(creator,/PEGAR IMAGEN/);
  assert.match(creator,/importImage\(which,file\)/);
  const css=read('src/components/fighterCreator.css');
  assert.match(css,/\.pb-creator-image-actions\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
test('result popup has pixel font and no scroll, with retained score and ELO details',()=>{
  const css=read('src/components/fightArena.css');
  assert.match(css,/\.arena-result-card\{[^}]*overflow:hidden/);
  assert.match(css,/\.arena-result-headline\{[^}]*Press Start 2P/);
  assert.match(css,/\.arena-result-actions\{display:grid;grid-template-columns:repeat\(2/);
  const jsx=read('src/components/FightArena.tsx');
  const replay=read('src/components/RematchRoster.tsx'),cssReplay=read('src/components/rematchRoster.css');
  for(const token of ['arena-match-summary','arena-result-elo-v35','stageLabel','eloLabel'])assert.ok(jsx.includes(token),token);
  for(const token of ['PEDIR REVANCHA','SALIR','CAMBIAR'])assert.ok(replay.includes(token),token);
  assert.match(cssReplay,/\.pb-replay\{[^}]*overflow:hidden/);
});
test('touched TSX files have no parse errors',()=>{
  for(const filename of ['src/components/OnlineLobby.tsx','src/components/FighterCreator.tsx']){
    const file=ts.createSourceFile(filename,read(filename),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    assert.deepEqual(file.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')),[],filename);
  }
});
