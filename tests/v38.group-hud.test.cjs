'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const hud=read('src/components/GroupFightArena.tsx');
const css=read('src/components/groupFightArena.css');

test('2v2 groups teammates across the clock, FFA keeps seat order',()=>{
  assert.match(hud,/battleMode==='2V2'\?\[0,2,1,3\]:\[0,1,2,3\]/);
  assert.match(hud,/column===2&&<div className="pb-group-clock"/);
});
test('SUPER is a pixelated portrait ring rather than a separate meter row',()=>{
  assert.match(hud,/SUPER_RING_TILES/);
  assert.match(hud,/role="progressbar"\s*\n\s*aria-label={`Súper/);
  assert.match(hud,/is-ready/);
  assert.match(css,/\.pb-group-super-ring > i\.is-filled/);
  assert.match(css,/image-rendering: pixelated/);
  assert.doesNotMatch(hud,/className="pb-group-hp"/);
});
test('health percentage, lives and KOs remain available for all four fighters',()=>{
  assert.match(hud,/100\*info\.hp\/Math\.max\(1,info\.maxHp\)/);
  assert.match(hud,/pb-group-health/);
  assert.match(hud,/pb-group-lives/);
  assert.match(hud,/pb-group-kos/);
  assert.match(hud,/info\?\.eliminated\?'KO'/);
});
test('clock is MM:SS and recreates 2 VS 2 glyph split from V37',()=>{
  assert.match(hud,/matchClock\(summary\?\.timeRemaining\?\?240\)/);
  assert.match(hud,/Math\.floor\(remaining\/60\)/);
  assert.match(hud,/pb-team-digit/);
  assert.match(hud,/pb-team-vs/);
  assert.match(css,/\.pb-team-vs \{ font: 400 7px\/1 'Press Start 2P'/);
  assert.match(css,/\.pb-group-clock-time[\s\S]*#ffdb5a/);
});
test('all four HUD cards float over the full arena without reserving a fixed header height',()=>{
  assert.match(css,/\.pb-group-hud-grid[\s\S]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\).*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.pb-group-hud\s*\{[^}]*position: absolute/);
  assert.doesNotMatch(css,/--group-hud-height/);
  assert.match(css,/@media \(orientation: portrait\)/);
  assert.match(css,/@media \(orientation: landscape\)/);
  assert.match(css,/\.pb-group-touch \.mobile-controls \{ pointer-events: none; background: transparent; border: 0; \}/);
});
