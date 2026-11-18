const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
test('el tutorial espera 2 segundos tras cumplir un objetivo y no cambia en el mismo frame',()=>{
  const arena=fs.readFileSync(path.join(root,'src/components/FightArena.tsx'),'utf8');
  assert.match(arena,/now - tutorialCompletedAtRef\.current >= 2000/);
  assert.match(arena,/tutorialCompletedAtRef\.current=now/);
  assert.match(arena,/setTutorialCelebrating\(true\)/);
  assert.match(arena,/tutorialCompletedAtRef\.current !== null\)\{/);
  assert.doesNotMatch(arena,/tutorialLessonCompleted\(lesson\.id,engine,tutorialOriginRef\.current\)\)advanceTutorial\(\)/);
});
test('saltar o reiniciar limpia la espera y muestra confirmación compacta',()=>{
  const arena=fs.readFileSync(path.join(root,'src/components/FightArena.tsx'),'utf8');
  assert.ok((arena.match(/tutorialCompletedAtRef\.current=null/g)||[]).length>=2);
  assert.ok((arena.match(/setTutorialCelebrating\(false\)/g)||[]).length>=2);
  assert.match(arena,/¡BIEN HECHO! · SIGUIENTE EN 2 S/);
  const css=fs.readFileSync(path.join(root,'src/components/fightArena.css'),'utf8');
  assert.match(css,/\.pb-school-success\{/);
});
