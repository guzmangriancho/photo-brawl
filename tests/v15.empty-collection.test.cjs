'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/components/CharacterSelect.tsx'),'utf8');
const output = ts.transpileModule(source,{fileName:'CharacterSelect.tsx',compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020},reportDiagnostics:true});
assert.equal((output.diagnostics || []).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,'CharacterSelect.tsx parses cleanly');
const prototype={
  id:'own-1',fighterName:'NOVA TEST', subtitle:'Campeona', archetype:'SHOTO_BALANCED',
  passiveTrait:'DOUBLE_JUMP', traitDescription:'Salta dos veces.',
  stats:{hp:25,speed:25,power:25,technique:25},portraitDataUrl:'data:image/png;base64,AA',spriteSheetDataUrl:'data:image/png;base64,AA',
  moveset:{lightNormal:{name:'JAB'},heavyNormal:{name:'PUÑO'},specialNeutral:{name:'RAYO'},specialForward:{name:'DASH'},specialUp:{name:'UP'},ultimateSuper:{name:'SUPER'}}
};
function harness(initialFighters){
  const hooks=[];let index=0;let fighters=initialFighters;
  const useState=(initial)=>{const i=index++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return [hooks[i],value=>{hooks[i]=typeof value==='function'?value(hooks[i]):value;}];};
  const stubComponent=(name)=>{const fn=()=>null; Object.defineProperty(fn,'name',{value:name}); return fn;};
  const FighterCreator=stubComponent('FighterCreator');
  const OnlineLobby=stubComponent('OnlineLobby');
  const CommunityPage=stubComponent('CommunityPage');
  const AccountPanel=stubComponent('AccountPanel');
  const FighterTransfers=stubComponent('FighterTransfers');
  const PwaInstallPrompt=stubComponent('PwaInstallPrompt');
  const jsx=(type,props,key)=>({type,props:props||{},key});
  const stages=['SKI_RESORT','NIGHT_PLAZA','SUMMER_SUMMIT','TEMPLE','ROOFTOP'];
  const modules={
    react:{__esModule:true,default:{},useState,useEffect:()=>{}},
    'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:Symbol('fragment')},
    'lucide-react':new Proxy({}, {get:(target,key)=>String(key)}),
    '../data/presetFighters':{getPresetFighters:()=>[{...prototype,id:'preset_1',fighterName:'DEMO',isPreset:true}]},
    './FavoriteButton':{FavoriteButton:stubComponent('FavoriteButton')},'./PlayerAvatar':{PlayerAvatar:stubComponent('PlayerAvatar')},
    '../services/useFavoriteFighter':{useFavoriteFighter:()=>({localId:null,avatarPath:null})},
    '../services/favoriteFighterService':{writeFavoriteFighter:async()=>{}},
    './FriendsPanel':{FriendsPanel:stubComponent('FriendsPanel')},
    '../services/useFriends':{useFriends:()=>({social:{friends:[],incoming:[],outgoing:[],invitations:[],sent:[]},socialError:'',refreshSocial:async()=>{}})},
    '../services/friendsService':{sendFriendRequest:async()=> 'sent',replyFriend:async()=>{},removeFriend:async()=>{},sendGameInvitation:async()=>{},replyGameInvitation:async()=>{}},
    '../services/publishedFighters':{ensureRankedOwnFighter:async()=>{}},
    './FighterCreator':{FighterCreator},'./OnlineLobby':{OnlineLobby},'./CommunityPage':{CommunityPage},'./AccountPanel':{AccountPanel},'./FighterTransfers':{FighterTransfers},'./PwaInstallPrompt':{PwaInstallPrompt},
    '../network/OnlineSession':{OnlineSession:{restore:async()=>null}},
    '../services/creatorDraftService':{markCreatorOpen:()=>{},wasCreatorOpen:()=>false},
    '../services/storageService':{deleteCustomFighter:async()=>{},renameCustomFighter:async()=>{},getGeminiApiKey:()=>'',setGeminiApiKey:()=>{}},
    '../services/communityService':{syncRenamedFighter:async()=> 'pending',currentUserIsAdmin:async()=>false},
    '../services/usePlayerAccount':{usePlayerAccount:()=>({user:null,loading:false})},
    '../services/fighterTransferService':{listFighterTransfers:async()=>({incoming:[],outgoing:[]})},
    '../services/supabaseClient':{supabase:null},
    '../services/automaticFighterMigration':{requestAutomaticMigration:()=>{}},
    '../engine/SoundFX':{soundFX:{muted:false,selectBeep:()=>{},confirmBeep:()=>{}}},
    '../data/stages':{STAGE_IDS:stages,STAGE_ART:Object.fromEntries(stages.map(id=>[id,{name:id,short:id,image:'/backgrounds/snow.jpg'}]))},
    './LeagueEmblem':{LeagueFrame:stubComponent('LeagueFrame'),LeagueBadge:stubComponent('LeagueBadge')},
    '../services/progressionService':{ownFighterRanks:async()=>({}),leagueFor:()=>({key:'BRONCE'})},
    './arcadeMenus.css':{}
  };
  const ctx={exports:{},require:name=>{if(!(name in modules))throw Error(`Unexpected import: ${name}`);return modules[name];},URLSearchParams,location:{search:''},localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},console};
  vm.runInNewContext(output.outputText,ctx,{filename:'CharacterSelect.js'});
  const render=()=>{index=0;return ctx.exports.CharacterSelect({fighters,onFighterCreated:f=>{fighters=[f,...fighters]},onFighterDeleted:id=>{fighters=fighters.filter(f=>f.id!==id)},onStartMatch:()=>{},onOnlineMatch:()=>{},onStartTutorial:()=>{}})};
  return {render,FighterCreator,setFighters:next=>fighters=next};
}
function visit(node,fn){if(Array.isArray(node)){node.forEach(child=>visit(child,fn));return;}if(node===null||node===undefined||typeof node==='boolean')return;if(typeof node!=='object')return;fn(node); visit(node.props?.children,fn);}
function find(node,predicate){const out=[];visit(node,n=>{if(predicate(n))out.push(n);});return out;}
function css(node,cls){return find(node,n=>typeof n.props?.className==='string' && n.props.className.split(/\s+/).includes(cls));}
function text(node){if(Array.isArray(node))return node.map(text).join(' ');if(node==null)return '';if(typeof node==='string'||typeof node==='number')return String(node);if(typeof node==='object')return text(node.props?.children);return '';}
function buttons(node,phrase){return find(node,n=>n.type==='button' && text(n).includes(phrase));}
test('New player sees one create button and no unavailable match/options actions',()=>{
  const h=harness([]),tree=h.render();
  assert.equal(css(tree,'pb-screen-home').length,1);
  assert.equal(buttons(tree,'CREAR CON FOTO').length,1);
  assert.equal(css(tree,'pb-match-option').length,0);
  assert.equal(css(tree,'pb-start').length,0);
  assert.equal(css(tree,'pb-play-unavailable').length,1);
  assert.equal(css(tree,'pb-options-layout').length,0);
  assert.equal(buttons(tree,'TUTORIAL').length,1);
});
test('Create button opens photo creator without visiting the fighter-select page',()=>{
  const h=harness([]);
  buttons(h.render(),'CREAR CON FOTO')[0].props.onClick();
  const tree=h.render();
  assert.equal(find(tree,n=>n.type===h.FighterCreator).length,1);
  assert.equal(css(tree,'pb-screen-home').length,1);
  assert.equal(css(tree,'pb-roster-layout').length,0);
});
test('Training and 1v1 selection never opens a blank options screen without a fighter',()=>{
  const h=harness([]);let tree=h.render();
  buttons(tree,'TRAINING')[0].props.onClick();tree=h.render();
  assert.match(text(css(tree,'pb-play-unavailable')[0]),/TRAINING/);
  assert.equal(css(tree,'pb-options-layout').length,0);
  buttons(tree,'1 VS 1')[0].props.onClick();tree=h.render();
  assert.match(text(css(tree,'pb-play-unavailable')[0]),/1 VS 1/);
  assert.equal(css(tree,'pb-options-layout').length,0);
});
test('After creating a fighter, home shows play controls; game options is no longer blank',()=>{
  const h=harness([]);
  buttons(h.render(),'CREAR CON FOTO')[0].props.onClick();
  const creator=find(h.render(),n=>n.type===h.FighterCreator)[0];
  creator.props.onCreated(prototype);
  let tree=h.render();
  assert.equal(css(tree,'pb-screen-home').length,1);
  assert.equal(css(tree,'pb-start').length,1);
  assert.equal(css(tree,'pb-play-unavailable').length,0);
  assert.match(text(css(tree,'pb-featured-name')[0]),/NOVA TEST/);
  css(tree,'pb-match-option')[0].props.onClick();
  tree=h.render();
  assert.equal(css(tree,'pb-options-layout').length,1);
  assert.equal(css(tree,'pb-screen-play').length,1);
});
test('Deleting the last fighter leaves one creation action, not three',()=>{
  const h=harness([prototype]);
  buttons(h.render(),'ELEGIR LUCHADOR')[0].props.onClick();
  h.setFighters([]);
  const tree=h.render();
  assert.equal(css(tree,'pb-roster-empty-layout').length,1);
  assert.equal(buttons(tree,'CREAR CON FOTO').length,1);
  assert.equal(css(tree,'pb-empty-profile').length,0);
});
