'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('right controls have only guard, jump, strike and technique; charged super is separate',()=>{
  const src=read('src/components/MobileControls.tsx');
  const side=src.slice(src.indexOf('<div className="mobile-action-side">'),src.indexOf('</nav>'));
  const right=side.slice(0,side.indexOf('      </div>\n      {superReady && ('));
  for(const control of ['mobile-guard','mobile-jump','mobile-strike','mobile-skill'])assert.match(right,new RegExp(control));
  assert.doesNotMatch(right,/mobile-super/);
  assert.match(side,/\{superReady && \(\s*<button[^>]*className=\{`mobile-super mobile-super-center/);
  assert.match(src,/id === 'guard'\) \{\s*inputRef\.current\.guard = true/);
  assert.match(src,/id === 'super'\) onAction\('SUPER'\)/);
});
test('CSS locates independent super centrally and main controls in two columns',()=>{
  const css=read('src/components/fightArena.css');
  assert.match(css,/\.mobile-utility-row \{ display: grid; grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.mobile-super-center \{[\s\S]*?position: absolute; left: 50%; bottom:/);
  assert.match(css,/\.mobile-super-center\.is-pressed \{ transform: translateX\(-50%\)/);
});
test('online latency is a small unobtrusive corner indicator with room info in tooltip',()=>{
  const css=read('src/components/online.css');
  const src=read('src/components/FightArena.tsx');
  assert.match(css,/\.arena-online-status\{position:absolute;z-index:7;bottom:5px;right:6px;left:auto;transform:none;pointer-events:none/);
  assert.match(src,/title=\{`Sala \$\{online\?\.code/);
  assert.match(src,/\$\{onlineLatency\} ms`:'ONLINE'/);
});
