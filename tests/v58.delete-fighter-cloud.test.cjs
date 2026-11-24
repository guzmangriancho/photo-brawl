'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','src/components/CharacterSelect.tsx'),'utf8');
test('deleting a fighter removes the cloud copy before the local one',()=>{
  const body=src.slice(src.indexOf('const removeCustom'),src.indexOf('useEffect',src.indexOf('const removeCustom')));
  const cloud=body.indexOf('await deleteCloudFighter(id)');
  const local=body.indexOf('await deleteCustomFighter(id)');
  assert.ok(cloud>=0&&local>cloud,'cloud delete must run first so startup restore cannot bring it back');
});
test('cloud delete fails loudly when no row was removed (RLS) and skips local-only fighters',()=>{
  const svc=fs.readFileSync(path.join(__dirname,'..','src/services/communityService.ts'),'utf8');
  const body=svc.slice(svc.indexOf('export async function deleteCloudFighter'));
  assert.match(body,/if\(!entry\)return;/);
  assert.match(body,/\.select\('id'\)/);
  assert.match(body,/if\(!data\?\.length\)throw/);
});
