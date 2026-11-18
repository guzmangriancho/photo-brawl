const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('classic registration, login and password update use Supabase Auth, not a parallel insecure user store',()=>{
 const src=read('src/components/AccountPanel.tsx');
 assert.match(src,/\.auth\.signUp\(\{email:cleanEmail,password\}\)/);
 assert.match(src,/\.auth\.signInWithPassword\(\{email:cleanEmail,password\}\)/);
 assert.match(src,/\.auth\.updateUser\(\{password:newPassword\}\)/);
 assert.doesNotMatch(src,/signInWithOtp\(/);
 assert.match(src,/authMode==='register'&&password!==passwordConfirm/);
 assert.match(src,/password\.length<8/);
 assert.match(src,/securityOpen/);
 assert.match(src,/exportLocalFightersBackup/);
 assert.match(src,/restoreCloudFightersReport/);
});

test('login and register screens include accessible labels, password autocomplete and a working submit action',()=>{
 const src=read('src/components/AccountPanel.tsx');
 assert.match(src,/onSubmit=\{e=>\{e\.preventDefault\(\);void submitCredentials\(\);\}\}/);
 for(const label of ['ENTRAR','REGISTRARSE','CORREO ELECTRÓNICO','CONTRASEÑA','REPETIR CONTRASEÑA']) assert.ok(src.includes(label),label);
 assert.match(src,/autoComplete=\{authMode==='login'\?'current-password':'new-password'\}/);
 assert.match(src,/autoComplete="new-password"/);
});

test('login UI is compact, and cache is advanced without touching the legacy fighter store',()=>{
 const css=read('src/components/community.css');
 assert.match(css,/\.pb-login-switch\{display:grid/);
 assert.match(css,/\.pb-login-fields\{grid-template-columns:/);
 assert.match(css,/@media\(max-height:410px\)/);
 assert.match(read('public/sw.js'),/pb-shell-v\d+[\w-]*/);
 const migration=read('src/services/automaticFighterMigration.ts');
 assert.match(migration,/pb-local-fighters-cloud-owner-v16-2/);
 assert.match(migration,/getAllCustomFighters/);
});
