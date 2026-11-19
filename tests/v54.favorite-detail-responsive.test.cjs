const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('La pestaña Publicar no ofrece botón de favorito',()=>{
 const source=read('src/components/CommunityPage.tsx');
 assert.doesNotMatch(source,/FavoriteButton|changeFavorite|writeFavoriteFighter/);
 assert.match(source,/pb-publish-portrait/);
});
test('El corazón queda únicamente en la ficha de luchador elegido y no sobre el retrato',()=>{
 const source=read('src/components/CharacterSelect.tsx');
 assert.equal((source.match(/\{favoriteHeart\(featured\)\}/g)||[]).length,1);
 assert.match(source,/<section className="pb-frame pb-profile-panel">\{favoriteHeart\(featured\)\}/);
 assert.doesNotMatch(source,/\{favoriteHeart\(f\)\}/);
 assert.match(read('src/components/arcadeMenus.css'),/\.pb-profile-panel>\.pb-favorite-toggle\{position:absolute;top:/);
});
test('Explorar contiene retrato + ataques en un layout específico de horizontal',()=>{
 const source=read('src/components/CommunityPage.tsx');
 const css=read('src/components/community.css');
 assert.match(source,/pb-community-detail-body/);
 assert.match(css,/\.pb-community-detail \.pb-community-detail-main>\.pb-league-frame>img\{[^}]*object-fit:contain/s);
 assert.match(css,/@media \(orientation:landscape\) and \(max-height:520px\)/);
 assert.match(css,/\.pb-community-detail \.pb-community-detail-body\{display:grid;grid-template-columns:/);
 assert.match(css,/\.pb-community-detail \.pb-community-moves\{display:grid;grid-template-columns:repeat\(2/);
});
