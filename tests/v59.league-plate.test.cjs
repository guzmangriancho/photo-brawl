'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('main-menu fighter card shows league and cups through the compact plate',()=>{
  const select=read('src/components/CharacterSelect.tsx');
  assert.match(select,/<LeagueCupPlate trophies=\{ownCups\[featured\.id\]\?\.trophies\?\?0\}\/>/);
  const emblem=read('src/components/LeagueEmblem.tsx');
  assert.match(emblem,/export function LeagueCupPlate/);
  assert.match(emblem,/<PixelCupTotal trophies=\{trophies\}\/>/);
  assert.match(read('src/components/arcadeMenus.css'),/\.pb-league-plate\{/);
});
