const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'../src/components',p),'utf8');
test('local and training stages are one row, paginated',()=>{
 const ui=read('CharacterSelect.tsx'),css=read('arcadeMenus.css');
 assert.match(ui,/STAGES\.slice\(stagePage \* stagePageSize/);
 assert.match(ui,/stagePageSize = 4/);
 assert.match(ui,/pb-stage-pagination/);
 assert.match(css,/\.pb-options-stage \.pb-stage-grid\{display:grid;grid-template-columns:repeat\(4/);
 assert.match(css,/grid-template-rows:minmax\(0,1fr\)/);
});
test('online stage picker is a single scrollable strip with all stages and random',()=>{
 const ui=read('OnlineLobby.tsx'),css=read('online.css');
 assert.match(ui,/pb-online-stage-strip/);
 assert.match(ui,/STAGE_IDS\.map\(id=>/);
 assert.match(ui,/session\?\.stage\('RANDOM'\)/);
 assert.match(css,/\.pb-online-stage-strip\{display:flex;flex-wrap:nowrap/);
 assert.match(css,/overflow-x:auto/);
 assert.doesNotMatch(ui,/stagePageCount/);
});
