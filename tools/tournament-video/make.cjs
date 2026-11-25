#!/usr/bin/env node
'use strict';
/* Generador de vídeo de torneo (vertical 1080x1920).  Uso: node make.cjs spec.json out.mp4 [soloSegmento]
 * Salida: out.mp4 (sin audio) + out.mp4.events.json (sonidos de golpe con su instante) ; audio.py y run.sh completan el vídeo.
 * Todo lo que se ve sale del motor real del juego (engineDir) con los datos del spec. Ver README.md. */
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const specPath=path.resolve(process.argv[2]),outFile=path.resolve(process.argv[3]||'out.mp4'),only=process.argv[4];
const spec=JSON.parse(fs.readFileSync(specPath,'utf8'));
const base=path.dirname(specPath), R=p=>path.resolve(base,p);
const nc=require(process.env.CANVAS_MODULE||'@napi-rs/canvas');
const {createCanvas,loadImage,GlobalFonts}=nc;
GlobalFonts.registerFromPath(R(spec.font),'Press Start 2P');
const eng=R(spec.engineDir);
const SFX=require(eng+'/engine/SoundFX.js').soundFX;
const EVENTS=[];let FRAMES=0,CURW=1;
for(const n of ['lightHit','heavyHit','block','parry','koImpact','superFlash','guardBreak','commandGrab','projectile','victoryFanfare','armorAbsorb'])SFX[n]=()=>{EVENTS.push({t:FRAMES/FPS,n,w:CURW});};
const FE=require(eng+'/engine/FightEngine.js').FightEngine, T=require(eng+'/engine/cpuTactics.js');
const FPS=30,W=1920,H=1080,VW=1080,VH=1920,AY=656,AH=608;
const COL=['#ffd84d','#4dd2ff','#ff6b9d','#7dff6b','#c084fc','#ff9a3c'];
const tac=T.normalizeCpuTactics;
const arena=createCanvas(W,H),mc=arena.getContext('2d');
const fc=createCanvas(VW,VH),c=fc.getContext('2d');
const ff=spawn('ffmpeg',['-y','-f','rawvideo','-pix_fmt','rgba','-s',VW+'x'+VH,'-r',String(FPS),'-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','16','-preset','veryfast','-movflags','+faststart',outFile],{stdio:['pipe','ignore','ignore']});
const done=new Promise(r=>ff.on('close',r));
let FADE=0;
async function emit(){
  if(FADE>0){c.fillStyle='rgba(0,0,0,'+Math.min(1,FADE)+')';c.fillRect(0,0,VW,VH);}
  const b=Buffer.from(fc.data());if(!ff.stdin.write(b))await new Promise(r=>ff.stdin.once('drain',r));FRAMES++;FADE=0;
}
const imgs={};async function img(p){return imgs[p]||(imgs[p]=await loadImage(R(p)));}
// ---- fondo vertical borroso con estilo pixel ----
function blurBg(im){
  const t=createCanvas(54,96),tc=t.getContext('2d');tc.imageSmoothingEnabled=true;
  const s=Math.max(54/im.width,96/im.height),w=im.width*s,h=im.height*s;tc.drawImage(im,(54-w)/2,(96-h)/2,w,h);
  const o=createCanvas(VW,VH),oc=o.getContext('2d');oc.imageSmoothingEnabled=true;oc.imageSmoothingQuality='high';oc.drawImage(t,0,0,VW,VH);
  oc.fillStyle='rgba(2,4,16,.52)';oc.fillRect(0,0,VW,VH);
  oc.fillStyle='rgba(0,0,0,.22)';for(let y=0;y<VH;y+=4)oc.fillRect(0,y,VW,1);
  return o;
}
const bgCache={};async function bgOf(stage){if(!bgCache[stage]){const im=await img(spec.stages[stage]);bgCache[stage]={im,blur:blurBg(im)};}return bgCache[stage];}
// Press Start 2P dibuja mal las mayúsculas acentuadas: se pintan sin acento y la marca se dibuja aparte (la fuente es monoespaciada).
function drawTxt(ctx,txt,x,y,font,fill,lw){
  const size=parseInt(font),plain=txt.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  ctx.font=font;ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.lineJoin='round';
  const left=x-plain.length*size/2,marks=[];
  [...txt.normalize('NFC')].forEach((ch,i)=>{if(/[\u00c0-\u017f]/.test(ch)&&ch.normalize('NFD')!==ch)marks.push(i);});
  if(lw){ctx.lineWidth=lw;ctx.strokeStyle='#050816';ctx.strokeText(plain,x,y);}
  ctx.fillStyle=fill;ctx.fillText(plain,x,y);
  const m=Math.max(2,Math.round(size/8));
  for(const i of marks){const cx=left+i*size+size*0.5;const my=y-size*1.0-m*2;
    if(lw){ctx.fillStyle='#050816';ctx.fillRect(cx-m*1.5-lw/3,my-m-lw/3,m*3+lw*2/3,m*2+lw*2/3);}
    ctx.fillStyle=fill;ctx.fillRect(cx-m*1.5+m,my-m,m*2,m*2);}
}
function outlined(txt,x,y,font,fill,lw=8){drawTxt(c,txt,x,y,font,fill,lw);}
function gradText(txt,x,y,size,top,bot){const g=c.createLinearGradient(0,y-size,0,y);g.addColorStop(0,top);g.addColorStop(1,bot);outlined(txt,x,y,size+'px "Press Start 2P"',g,Math.round(size/7));}
function fit(txt,max,size){c.font=size+'px "Press Start 2P"';while(c.measureText(txt).width>max&&size>12){size-=2;c.font=size+'px "Press Start 2P"';}return size;}
function bands(label,sub){
  gradText('PHOTO',VW/2-210,300,64,'#fff3d6','#fff3d6');gradText('BRAWL',VW/2+160,300,64,'#ffd84d','#ff8a1f');
  outlined(spec.tournamentLabel||'TORNEO','' +VW/2,372,'24px "Press Start 2P"','#8fd8ff',6);
  const s=fit(label,980,54);outlined(label,VW/2,1470,s+'px "Press Start 2P"','#ffd84d',10);
  if(sub)outlined(sub,VW/2,1540,'24px "Press Start 2P"','#fff3d6',6);
}
function frameArena(){
  c.drawImage(arena,0,AY,VW,AH);
  c.lineWidth=6;c.strokeStyle='#050816';c.strokeRect(-3,AY-3,VW+6,AH+6);
  c.lineWidth=2;c.strokeStyle='#ffd84d';c.strokeRect(0,AY-9,VW,1);c.strokeRect(0,AY+AH+8,VW,1);
}
// ---- intro ----
async function title(){
  const {im}=await bgOf(spec.introStage);const N=FPS*(spec.introSeconds||4);
  for(let i=0;i<N;i++){
    const s0=Math.max(VH/im.height,VW/im.width),w=im.width*s0,h=im.height*s0;c.imageSmoothingEnabled=true;c.drawImage(im,(VW-w)/2,(VH-h)/2,w,h);
    c.fillStyle='rgba(4,8,24,.62)';c.fillRect(0,0,VW,VH);
    const g=c.createRadialGradient(VW/2,VH/2,VH*.25,VW/2,VH/2,VH*.75);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.6)');c.fillStyle=g;c.fillRect(0,0,VW,VH);
    const t=i/FPS,a=Math.min(1,t/0.6),sc=0.96+0.04*Math.min(1,t/0.8);
    c.save();c.globalAlpha=a;c.translate(VW/2,VH/2);c.scale(sc,sc);c.translate(-VW/2,-VH/2);
    gradText('PHOTO',VW/2,VH/2-60,128,'#fff3d6','#fff3d6');gradText('BRAWL',VW/2,VH/2+110,128,'#ffd84d','#ff8a1f');
    outlined(spec.introSub||'ARCADE FIGHT CLUB','' +VW/2,VH/2+200,'28px "Press Start 2P"','#8fd8ff',6);
    c.restore();
    if(t>(spec.introSeconds||4)-0.6)FADE=(t-((spec.introSeconds||4)-0.6))/0.6;
    await emit();
  }
}
// ---- combates ----
async function mkEngine(seg,f){
  const A=spec.fighters[f.a],B=spec.fighters[f.b];
  const e=new FE(A.profile,B.profile,'CPU_VS_CPU',seg.stage,spec.difficulty||'NORMAL',{p1:tac(f.tacticsA),p2:tac(f.tacticsB)},f.seed);
  e.roundsToWin=seg.rtw;
  e.p1.spriteSheet=await img(A.sheet);e.p2.spriteSheet=await img(B.sheet);
  e.beginVersusIntro();e.renderStage=()=>{};e.drawFighterIndicator=()=>{};return e;
}
async function segment(seg){
  const overlay=seg.fights.length>1,SPF=seg.spf||4,{im,blur}=await bgOf(seg.stage);
  const es=[];for(const f of seg.fights)es.push({e:await mkEngine(seg,f),f,post:0,layer:createCanvas(960,540)});
  if(overlay)for(const x of es)x.e.renderShadow=()=>{};
  const LAST=120;let frame=0;
  while(es.some(x=>x.post<LAST)){
    CURW=overlay?1/Math.sqrt(es.length):1;
    for(const x of es)for(let k=0;k<SPF;k++){if(x.post>=LAST)break;x.e.step();if(x.e.roundOver)x.post++;}
    c.drawImage(blur,0,0);
    mc.imageSmoothingEnabled=true;mc.drawImage(im,0,0,W,H);
    es.forEach((x,i)=>{
      const lc=x.layer.getContext('2d');lc.clearRect(0,0,960,540);
      try{x.e.callouts=[];x.e.render(lc);}catch(err){if(frame<2)console.error('render err',err.message);}
      let alpha=1;
      if(overlay){if(x.post>80)alpha=Math.max(0,1-(x.post-80)/40);alpha*=0.88;
        lc.save();lc.strokeStyle=COL[i%COL.length];lc.lineWidth=3;lc.globalAlpha=0.9;
        for(const fi of x.e.getFighters()){lc.beginPath();lc.ellipse(fi.x,fi.y+3,30,8,0,0,Math.PI*2);lc.stroke();}lc.restore();}
      if(alpha>0){mc.save();mc.globalAlpha=alpha;mc.imageSmoothingEnabled=false;mc.drawImage(x.layer,0,0,W,H);
        mc.font='28px "Press Start 2P"';mc.textAlign='center';mc.lineJoin='round';
        const nm=[x.f.a,x.f.b];
        x.e.getFighters().forEach((fi,k)=>{if(fi.hp<=0)return;const tx=Math.max(110,Math.min(W-110,fi.x*2)),ty=Math.max(40,fi.y*2-262);
          drawTxt(mc,nm[k],tx,ty,'28px "Press Start 2P"',overlay?COL[i%COL.length]:'#fff3d6',9);});
        mc.restore();}
    });
    frameArena();bands(seg.label,seg.fights.length+(seg.fights.length>1?' COMBATES':' COMBATE'));
    if(frame/FPS<0.5)FADE=1-frame/FPS/0.5;
    await emit();frame++;if(frame>FPS*400)break;
  }
  if(!seg.noFadeOut)for(let i=1;i<=8;i++){FADE=i/8;await emit();}
}
// ---- cierre de campeón ----
async function outro(){
  const {blur}=await bgOf(spec.rounds[spec.rounds.length-1].stage);const ch=spec.fighters[spec.champion];
  const por=await img(ch.portrait);const N=Math.round(FPS*(spec.outroSeconds||5));
  for(let i=0;i<N;i++){
    const t=i/FPS;c.drawImage(blur,0,0);
    for(let k=0;k<46;k++){const sx=(k*137)%VW,sp=60+(k*53)%90,y=((t*sp+k*97)%(VH+40))-20,sz=6+(k%3)*4;c.fillStyle=COL[k%COL.length];c.globalAlpha=.65;c.fillRect(sx,y,sz,sz);}
    c.globalAlpha=1;
    const a=Math.min(1,t/0.6);c.save();c.globalAlpha=a;
    outlined(spec.tournamentLabel||'TORNEO','' +VW/2,430,'38px "Press Start 2P"','#8fd8ff',8);
    gradText('CAMPEÓN',VW/2,560,92,'#ffe27a','#ff9a1f');
    const pop=0.9+0.1*Math.min(1,t/0.7),S=540*pop,px=(VW-S)/2,py=640+(540-S)/2;
    c.fillStyle='#050816';c.fillRect(px-14,py-14,S+28,S+28);c.fillStyle='#ffd84d';c.fillRect(px-8,py-8,S+16,S+16);c.fillStyle='#050816';c.fillRect(px-4,py-4,S+8,S+8);
    c.imageSmoothingEnabled=false;c.drawImage(por,px,py,S,S);
    const s=fit(spec.champion,960,72);outlined(spec.champion,VW/2,1330,s+'px "Press Start 2P"','#fff3d6',12);
    gradText('PHOTO',VW/2-210,1560,52,'#fff3d6','#fff3d6');gradText('BRAWL',VW/2+150,1560,52,'#ffd84d','#ff8a1f');
    c.restore();
    if(t<0.5)FADE=1-t/0.5;
    if(t>(N/FPS)-1)FADE=(t-(N/FPS-1));
    await emit();
  }
}
(async()=>{
  if(!only||only==='TITLE')await title();
  for(const seg of spec.rounds){if(only&&only!==seg.id)continue;await segment(seg);}
  if(!only||only==='OUTRO')await outro();
  ff.stdin.end();await done;
  fs.writeFileSync(outFile+'.events.json',JSON.stringify({fps:FPS,frames:FRAMES,events:EVENTS}));
  console.log('listo',outFile,(FRAMES/FPS).toFixed(1)+'s');
})();
