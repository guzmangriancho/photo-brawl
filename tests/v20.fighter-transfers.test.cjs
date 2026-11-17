const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=(()=>{try{return require('typescript');}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');}})();
const root=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/202611170002_fighter_transfers.sql'),'utf8');
const service=fs.readFileSync(path.join(root,'src/services/fighterTransferService.ts'),'utf8');
const migration=fs.readFileSync(path.join(root,'src/services/communityService.ts'),'utf8');
const ui=fs.readFileSync(path.join(root,'src/components/FighterTransfers.tsx'),'utf8');
const account=fs.readFileSync(path.join(root,'src/components/AccountPanel.tsx'),'utf8');
const select=fs.readFileSync(path.join(root,'src/components/CharacterSelect.tsx'),'utf8');

test('TypeScript transfers and JSX compile syntactically',()=>{
 for(const [file,jsx] of [
  ['src/services/fighterTransferService.ts',false],['src/services/communityService.ts',false],
  ['src/components/FighterTransfers.tsx',true],['src/components/CharacterSelect.tsx',true],
  ['src/components/AccountPanel.tsx',true],['src/App.tsx',true]]){
   const data=fs.readFileSync(path.join(root,file),'utf8');
   const out=ts.transpileModule(data,{fileName:file,reportDiagnostics:true,compilerOptions:{
      target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,
      jsx:ts.JsxEmit.ReactJSX,
   }});
   const errors=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
   assert.deepEqual(errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')),[],file);
 }
});
test('Only sender can invite; only recipient can accept; identities use auth.uid',()=>{
 assert.match(sql,/v_row\.owner_id<>v_sender/);
 assert.match(sql,/v_recipient=v_sender/);
 assert.match(sql,/v_request\.recipient_id<>v_recipient/);
 assert.match(sql,/p_action='cancelled' and v_request\.sender_id<>auth\.uid\(\)/);
 assert.match(sql,/p_action='declined' and v_request\.recipient_id<>auth\.uid\(\)/);
 assert.match(sql,/status='pending'/);
 assert.match(sql,/expires_at>now\(\)/);
 assert.match(sql,/revoke all on public\.fighter_transfers from public,anon,authenticated/);
 assert.doesNotMatch(sql,/grant (insert|update|delete).*public\.fighter_transfers to authenticated/i);
});
test('The fighter stays unique in cloud: ownership updated in place after both private assets verified',()=>{
 const block=sql.split('create or replace function public.accept_fighter_transfer(')[1].split('$$;')[0];
 assert.match(block,/from storage\.objects where bucket_id='fighter-private'/);
 assert.match(block,/update public\.fighters set owner_id=v_recipient/);
 assert.doesNotMatch(block,/insert into public\.fighters/);
 assert.match(block,/is_public=false,public_portrait_path=null,public_sheet_path=null/);
 assert.match(sql,/private_sheet_path=p_new_sheet_path/);
 assert.match(sql,/on delete set null/); // keep tombstone when recipient later deletes
 assert.match(sql,/original_local_id=p_local_id and status='accepted'/);
});
test('Transfer state and assets are private and permission-limited',()=>{
 assert.match(sql,/create policy "Leer imágenes del luchador ofrecido"/);
 assert.match(sql,/recipient_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/f\.is_public=false/);
 assert.match(sql,/f\.private_sheet_path=p_path or f\.private_portrait_path=p_path/);
 assert.match(service,/uploadPrivate\(portraitPath,portrait\.data\)/);
 assert.match(service,/accept_fighter_transfer/);
 assert.match(service,/get_transfer_payload/);
 assert.match(service,/status','accepted'/);
});
test('Old owner never resurrected by migration and its local copy is removed only after accepted',()=>{
 assert.match(migration,/transferred\.has\(fighter\.id\)/);
 assert.match(service,/\.eq\('status','accepted'\)/);
 assert.match(service,/if\(stored\.has\(transfer\.original_local_id\)\)/);
 assert.match(service,/deleteCustomFighter\(transfer\.original_local_id\)/);
 assert.match(sql,/sender_has_transferred_local_id\(local_id\)/);
});
test('App allows send by unique handle and recipient can accept/reject from Account',()=>{
 assert.match(select,/TRANSFERIR<\/button>/);
 assert.match(account,/REGALOS<\/button>/);
 assert.match(ui,/USUARIO ÚNICO DEL DESTINATARIO/);
 assert.match(ui,/ACEPTAR/);
 assert.match(ui,/RECHAZAR/);
 assert.match(ui,/CANCELAR/);
 assert.match(ui,/PER_PAGE=3/);
});
