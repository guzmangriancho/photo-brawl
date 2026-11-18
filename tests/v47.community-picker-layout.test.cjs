const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..','src','components');
const read = name=>fs.readFileSync(path.join(root,name),'utf8');
test('Community picker reuses the same compact cards and pager as own fighters',()=>{
  const picker=read('PublishedFighterPicker.tsx');
  const lobby=read('OnlineLobby.tsx');
  assert.match(picker,/className="pb-online-fighter-list pb-published-grid"/);
  assert.match(picker,/className="pb-online-picker-pages pb-published-pages"/);
  assert.match(lobby,/className="pb-online-fighter-list"/);
  assert.match(lobby,/className="pb-online-picker-pages"/);
  assert.match(picker,/<span title=\{`\$\{item.name\}/);
  assert.doesNotMatch(picker,/<small>@\{item.author\}<\/small>/);
});
test('Community search is placeholder-only and redundant explanations are gone',()=>{
  const picker=read('PublishedFighterPicker.tsx');
  const lobby=read('OnlineLobby.tsx');
  assert.match(picker,/placeholder="Buscar luchadores\.\.\."/);
  assert.doesNotMatch(picker,/BUSCAR LUCHADORES PUBLICADOS|SOLO LUCHADORES PUBLICADOS|NO SE GUARDAN EN TU COLECCIÓN/);
  assert.doesNotMatch(lobby,/AMISTOSO · TODOS LOS PUBLICADOS|Los publicados se pueden usar sin importarlos/);
  assert.match(picker,/searchPublishedFighters\(query,page\)/);
  assert.match(picker,/loadPublishedFighter\(item.entry\)/);
});
