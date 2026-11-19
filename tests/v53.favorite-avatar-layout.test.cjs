'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=(filename)=>fs.readFileSync(path.join(root,filename),'utf8');

function serviceWithMocks({uploadFails=false,updateFails=false}={}){
  const actions=[];
  let uploads=0;
  const uuid='123e4567-e89b-42d3-a456-426614174000';
  const user={id:uuid};
  const supabase={
    auth:{getUser:async()=>({data:{user},error:null})},
    from(table){assert.equal(table,'player_profiles');return{
      select(columns){actions.push(['read',columns]);return{
        eq(_column,_id){return{single:async()=>({data:{favorite_avatar_path:`${uuid}/avatars/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa.png`},error:null})};},
      };},
      update(data){actions.push(['update',data]);return{
        eq(){return{select(){return{maybeSingle:async()=>({data:updateFails?null:{id:uuid},error:updateFails?new Error('Fallo SQL'):null})};}};},
      };},
    };},
    storage:{from(bucket){assert.equal(bucket,'fighter-public');return{
      upload:async (name,blob)=>{uploads++;actions.push(['upload',name,blob.type]);return {error:uploadFails?new Error('Fallo storage'):null};},
      remove:async paths=>{actions.push(['remove',paths]);return {error:null};},
      getPublicUrl: name=>({data:{publicUrl:`https://example.com/${name}`}}),
    };}},
  };
  const source=ts.transpileModule(read('src/services/favoriteFighterService.ts'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
    fileName:'favoriteFighterService.ts',reportDiagnostics:true,
  }).outputText;
  const module={exports:{}};
  const events=[];
  const context={module,exports:module.exports,Blob,Uint8Array,atob,Error,crypto:require('node:crypto').webcrypto,
    window:{dispatchEvent:event=>events.push(event.type)},Event:class Event{constructor(type){this.type=type;}},
    require(name){
      if(name==='./supabaseClient')return {supabase};
      if(name==='./communityService')return {cloudEntry:async()=>({id:uuid}),saveFighterCloud:async()=>{throw Error('No debería guardar.');}};
      throw Error(`Importación inesperada ${name}`);
    },
  };
  vm.runInNewContext(source,context,{filename:'favoriteFighterService.js'});
  const fighter={id:'custom_abc',isPreset:false,portraitDataUrl:'data:image/png;base64,aGVsbG8='};
  return{service:module.exports,events,actions,uploads:()=>uploads,fighter,uuid};
}

test('perfil: sube exclusivamente el retrato y después guarda referencia; elimina el avatar anterior',async()=>{
  const {service,actions,events,fighter,uuid}=serviceWithMocks();
  await service.writeFavoriteFighter(fighter);
  assert.equal(actions[0][0],'read');
  assert.equal(actions[1][0],'upload');
  assert.match(actions[1][1],new RegExp(`^${uuid}/avatars/[0-9a-f-]{36}\\.png$`));
  assert.equal(actions[2][0],'update');
  assert.equal(actions[2][1].favorite_fighter_id,uuid);
  assert.equal(actions[2][1].favorite_avatar_path,actions[1][1]);
  assert.equal(actions[3][0],'remove');
  assert.deepEqual(events,['pb-favorite-fighter-changed']);
});

test('fallo al guardar la BD: elimina nueva imagen y no anuncia el favorito',async()=>{
  const {service,actions,events,fighter}=serviceWithMocks({updateFails:true});
  await assert.rejects(()=>service.writeFavoriteFighter(fighter),/Fallo SQL/);
  assert.equal(actions[1][0],'upload');
  assert.equal(actions.at(-1)[0],'remove');
  assert.deepEqual(events,[]);
});

test('desmarcar favorito limpia datos sin subir imágenes',async()=>{
  const {service,actions,events}=serviceWithMocks();
  await service.writeFavoriteFighter(null);
  assert.ok(!actions.some(a=>a[0]==='upload'));
  assert.equal(actions.find(a=>a[0]==='update')[1].favorite_fighter_id,null);
  assert.equal(actions.find(a=>a[0]==='update')[1].favorite_avatar_path,null);
  assert.deepEqual(events,['pb-favorite-fighter-changed']);
});

test('rutas de avatar no confiables jamás forman una URL pública',()=>{
  const {service,uuid}=serviceWithMocks();
  assert.equal(service.avatarPublicUrl('../fighter-private/secret'), '');
  assert.equal(service.avatarPublicUrl('javascript:alert(1)'), '');
  assert.match(service.avatarPublicUrl(`${uuid}/avatars/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa.png`),/^https:/);
});

test('las tarjetas de Explorar son 2 x 3, no requieren scroll y los nombres están fuera del marco',()=>{
  const css=read('src/components/community.css');
  const block=css.slice(css.indexOf('/* V53 · Six full cards'));
  assert.match(block,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(block,/grid-template-rows:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(block,/overflow:hidden;padding:2px 3px 3px/);
  assert.match(block,/aspect-ratio:1/);
  assert.match(block,/\.pb-community-card>strong\{/);
});

test('El corazón solo aparece en la ficha de luchador elegido; rankings, cuenta y dúos usan avatar',()=>{
  const community=read('src/components/CommunityPage.tsx');
  const select=read('src/components/CharacterSelect.tsx');
  const account=read('src/components/AccountPanel.tsx');
  const avatar=read('src/components/PlayerAvatar.tsx');
  assert.match(community,/pb-publish-portrait/);
  assert.doesNotMatch(community,/FavoriteButton/);
  assert.match(select,/pb-portrait-choice-wrap/);
  assert.match(select,/pb-profile-favorite-art/);
  assert.match(select,/pb-fighter-sheet-art/);
  assert.match(select,/<section className=\"pb-frame pb-profile-panel\">\{favoriteHeart\(featured\)\}/);
  assert.doesNotMatch(select,/\{favoriteHeart\(f\)\}/);
  assert.doesNotMatch(select,/<div className=\"pb-fighter-sheet-art\">[^<]*<FighterPortrait[^>]*\/>\{favoriteHeart/);
  assert.match(community,/path=\{p\.favorite_avatar_path\}/);
  assert.match(community,/path=\{duo\.a\?\.favorite_avatar_path\}/);
  assert.match(account,/path=\{favorite\.avatarPath\}/);
  assert.match(avatar,/image-rendering|pb-player-avatar/);
});

test('migración garantiza propietario, ruta correcta, actualización acotada y desmarcar al transferir',()=>{
  const sql=read('supabase/migrations/202611190002_favorite_fighter_profile.sql');
  assert.match(sql,/references public\.fighters\(id\) on delete set null/i);
  assert.match(sql,/f\.id = new\.favorite_fighter_id and f\.owner_id = new\.id/i);
  assert.match(sql,/new\.favorite_avatar_path !~/i);
  assert.match(sql,/grant update \(favorite_fighter_id,favorite_avatar_path\)/i);
  assert.match(sql,/before delete or update of owner_id on public\.fighters/i);
});

test('componentes TSX modificados se pueden analizar sin errores de sintaxis',()=>{
  for(const file of ['src/components/CharacterSelect.tsx','src/components/CommunityPage.tsx','src/components/AccountPanel.tsx','src/components/PlayerAvatar.tsx','src/components/FavoriteButton.tsx']){
    const tree=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    assert.deepEqual(tree.parseDiagnostics,[],file);
  }
});
