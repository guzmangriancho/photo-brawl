const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..');
const tsx = fs.readFileSync(path.join(root,'src/components/CharacterSelect.tsx'),'utf8');
const css = fs.readFileSync(path.join(root,'src/components/arcadeMenus.css'),'utf8');
test('Mode names are consistent and use a single text title',()=>{
  assert.match(tsx,/id: '1P_VS_CPU', title: '1 VS 1'/);
  assert.match(tsx,/id: '2V2', title: '2 VS 2'/);
  assert.match(tsx,/<strong>\{item.title\}<\/strong>/);
  assert.doesNotMatch(tsx,/className="pb-team-format"/);
});
test('Modes occupy equal first two rows and a taller online third row',()=>{
  const last = css.slice(css.indexOf('/* V43:'));
  assert.match(last,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(last,/grid-template-rows:minmax\(0,1fr\) minmax\(0,1fr\) minmax\(0,1\.23fr\)/);
  assert.match(last,/\.pb-home-modes > \.pb-mode-online\s*\{[^}]*grid-column:1 \/ -1;[^}]*grid-row:3/s);
});
test('Options are grey and titles use original pixel font',()=>{
  const last = css.slice(css.indexOf('/* V43:'));
  assert.match(last,/font-family:'Pixelify Sans'/);
  assert.match(last,/\.pb-match-option\s*\{[^}]*background:linear-gradient\(115deg,#404957f5,#2d3645fa\)/s);
});
