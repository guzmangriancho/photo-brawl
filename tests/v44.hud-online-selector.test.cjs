const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=p=>fs.readFileSync(path.join(__dirname,'../src/components',p),'utf8');
test('group HUD has small transparent fighter boxes with centered clock and flexible gap',()=>{
 const css=src('groupFightArena.css');
 assert.match(css,/\/\* V44 — HUD/);
 assert.match(css,/repeat\(2,minmax\(0,clamp\(82px,13\.6vw,116px\)\)\) minmax\(52px,1fr\)/);
 assert.match(css,/rgba\(5,15,34,\.34\)/);
 assert.match(css,/\.pb-group-clock \{ width: clamp\(51px,7\.2vw,66px\)/);
});
test('online room format retains the arcade-readable unified labels without helper text',()=>{
 const jsx=src('OnlineLobby.tsx'),css=src('online.css');
 assert.match(jsx,/\['2V2','2 VS 2'\]/);
 assert.match(jsx,/onClick=\{\(\)=>\{setBattleMode\(id\)/);
 assert.doesNotMatch(jsx,/4 JUGADORES · 3 VIDAS · MAPAS MULTINIVEL/);
 assert.match(css,/\/\* V44 — Modos online/);
 assert.match(css,/font-family: 'Pixelify Sans'/);
});
