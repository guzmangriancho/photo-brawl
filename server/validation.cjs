'use strict';
const AR=['RUSHDOWN','GRAPPLER_TANK','ZONER_MAGE','TRICKSTER','SHOTO_BALANCED'];
const PASS=['DOUBLE_JUMP','AIR_DASH','HEAVY_ARMOR_STARTUP','FAST_METER_GAIN','LONG_REACH_LIMBS','VAMPIRIC_ON_SPECIAL'];
const NORMAL1=['FAST_JAB','LOW_KICK','QUICK_PALM'];
const NORMAL2=['OVERHEAD_SMASH','SWEEP_TRIP','LONG_ROUNDHOUSE','LAUNCHER_UPPER'];
const NEUTRAL=['STRAIGHT_FIREBALL','ARCING_LOB_OBJECT','GROUND_SHOCKWAVE','BOOMERANG_RETURN','TRAP_MINE_DROP','SHORT_SHOTGUN_BLAST'];
const FORWARD=['ARMORED_SHOULDER_DASH','TELEPORT_BEHIND','COMMAND_GRAB_SLAM','SLIDE_LOW_KICK','SPINNING_ADVANCE'];
const UP=['INVINCIBLE_UPPERCUT','DIVE_KICK_FROM_AIR','VERTICAL_TORNADO','HIGH_LEAP_STOMP'];
const SUPER=['GIANT_BEAM_LASER','MULTI_HIT_RUSH_COMBO','METEOR_SCREEN_DROP','OMEGA_SUPLEX'];
function str(v,max=110){return typeof v==='string' ? v.trim().slice(0,max) : '';}
function art(v,max) {
  if (typeof v!=='string' || v.length > max ||
    !/^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v)) return null;
  return v;
}
function validateProfile(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data))return null;
  // The four bundled actors belong exclusively to the offline tutorial.
  if (data.isPreset === true || (typeof data.id === 'string' && data.id.startsWith('preset_')))return null;
  const s=data.stats,m=data.moveset;
  if(!s || !m || !AR.includes(data.archetype) || !PASS.includes(data.passiveTrait))return null;
  const vals=['hp','speed','power','technique'].map(k=>s[k]);
  if(vals.some(v=>!Number.isInteger(v)||v<15||v>35) || vals.reduce((a,b)=>a+b,0)!==100)return null;
  const slots=[['lightNormal',NORMAL1,'style'],['heavyNormal',NORMAL2,'style'],
    ['specialNeutral',NEUTRAL,'mechanic'],['specialForward',FORWARD,'mechanic'],
    ['specialUp',UP,'mechanic'],['ultimateSuper',SUPER,'mechanic']];
  if(slots.some(([key,enumValues,field])=>!m[key] || !enumValues.includes(m[key][field])))return null;
  const sprite=art(data.spriteSheetDataUrl,4_200_000),portrait=art(data.portraitDataUrl,1_300_000);
  if(!sprite || !portrait || !str(data.fighterName,35))return null;
  const moveset={};
  for(const [key,,field] of slots){
    moveset[key]={name:str(m[key].name,55),[field]:m[key][field]};
    if(key==='specialNeutral'){
      moveset[key].visualAction=str(m[key].visualAction,160);
      moveset[key].primaryHex=/^#[0-9a-fA-F]{6}$/.test(m[key].primaryHex)?m[key].primaryHex:'#55eaff';
    }
    if(key==='specialForward'||key==='specialUp'||key==='ultimateSuper')
      moveset[key].visualAction=str(m[key].visualAction,160);
  }
  return {
    id:str(data.id,70),fighterName:str(data.fighterName,35),subtitle:str(data.subtitle,65),
    archetype:data.archetype,passiveTrait:data.passiveTrait,
    traitDescription:str(data.traitDescription,170),stats:{hp:s.hp,speed:s.speed,power:s.power,technique:s.technique},
    moveset,visualDescriptionForSprite:str(data.visualDescriptionForSprite,500),
    isPreset:Boolean(data.isPreset),ultimateForm:data.ultimateForm===true,createdAt:Number(data.createdAt)||0,
    spriteSheetDataUrl:sprite,portraitDataUrl:portrait,
    spriteSheetLayoutVersion:data.spriteSheetLayoutVersion===2?2:undefined,
    spriteSheetLastCell:data.spriteSheetLastCell==='KO'?'KO':'PROJECTILE',
    scaleMultiplier:typeof data.scaleMultiplier==='number' && data.scaleMultiplier>=0.8 && data.scaleMultiplier<=1.3 ? data.scaleMultiplier : 1,
  };
}
function cleanActions(actions) {
  if(!Array.isArray(actions) || actions.length>6)return [];
  const moves=['LIGHT','HEAVY','LOW','RUSH','SP_NEUTRAL','SP_FORWARD','SP_UP','SUPER'];
  return actions.flatMap(a=>{
    if(!a || typeof a!=='object')return [];
    if(a.kind==='move'&&moves.includes(a.slot))return [{kind:'move',slot:a.slot}];
    if(a.kind==='jump')return [{kind:'jump'}];
    if(a.kind==='dash'&&(a.dir===-1||a.dir===1))return [{kind:'dash',dir:a.dir}];
    return [];
  });
}
module.exports={validateProfile,cleanActions};
