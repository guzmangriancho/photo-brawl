const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('group setup selects P1-P4 first then a fighter from one shared gallery',()=>{
 const ui=read('src/components/CharacterSelect.tsx');
 assert.match(ui,/activeGroupSeat/);assert.match(ui,/groupSeats\.map\(/);
 assert.match(ui,/selectGroupFighter\(f\)/);assert.match(ui,/setP1Id\(fighter\.id\)/);
 assert.match(ui,/setP2Id\(fighter\.id\)/);assert.match(ui,/setP3Id\(fighter\.id\)/);assert.match(ui,/setP4Id\(fighter\.id\)/);
 assert.doesNotMatch(ui,/pb-local-group-slot/);
});
test('super is centrally aligned on portrait for 1v1 and four participants',()=>{
 for(const f of ['src/components/fightArena.css','src/components/groupFightArena.css']){
  const css=read(f);
  const section=css.slice(css.lastIndexOf('/* V41'));
  assert.match(section,/left:50%!important/);assert.match(section,/right:auto!important/);
  assert.match(section,/translateX\(-50%\)/);
 }
});
test('pause and rematch use consistent pixel arcade frames',()=>{
 const pause=read('src/components/groupFightArena.css'),result=read('src/components/rematchRoster.css');
 assert.match(pause,/\.pb-group-pause section\{[^}]*outline:2px solid #869db7/);
 assert.match(result,/\.pb-replay\{[^}]*outline:2px solid #869db7/);
});
