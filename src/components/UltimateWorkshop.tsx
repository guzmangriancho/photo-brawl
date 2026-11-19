import React,{useState} from 'react';
import {ArrowLeft,Check,ClipboardCopy,CloudUpload,Crown,FileJson,Image,Loader2,ShieldCheck,Sparkles,Upload,X} from 'lucide-react';
import type {FighterDesignSchema,FighterProfile} from '../types/fighter';
import {buildUltimateBrief,buildUltimatePortraitPrompt,buildUltimateSheetPrompt,validateUltimateJson} from '../services/ultimatePrompts';
import {saveUltimate,type UltimateReady} from '../services/ultimateForms';
import {processPortrait,processSpriteSheet,readArtFile} from '../engine/SpriteProcessor';
import './ultimate.css';

interface Props{base:FighterProfile;onClose:()=>void;onSaved:(ready:UltimateReady)=>void;}
const STEPS=['FICHA','RETRATO','SPRITES','GUARDAR'] as const;
function explain(e:unknown){return e instanceof Error?e.message:'No se pudo completar el Despertar.';}
export function UltimateWorkshop({base,onClose,onSaved}:Props){
  const [step,setStep]=useState(0);
  const [json,setJson]=useState('');
  const [design,setDesign]=useState<FighterDesignSchema|null>(null);
  const [portrait,setPortrait]=useState('');
  const [sheet,setSheet]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [copyStatus,setCopyStatus]=useState('');
  const prompt=step===0?buildUltimateBrief(base):step===1&&design?buildUltimatePortraitPrompt(base,design):step===2&&design?buildUltimateSheetPrompt(base,design):'';
  const copyPrompt=async()=>{
    try{await navigator.clipboard.writeText(prompt);setCopyStatus('PROMPT COPIADO');}
    catch{setCopyStatus('Selecciona el texto del recuadro y cópialo manualmente.');}
  };
  const acceptJson=()=>{
    try{const parsed=validateUltimateJson(base,json);setDesign(parsed);setError('');setStep(1);}
    catch(e){setError(explain(e));}
  };
  const importArt=async(file:File|undefined,which:'portrait'|'sheet')=>{
    if(!file||busy)return;
    setBusy(true);setError('');
    try{
      if(file.size>12_000_000)throw new Error('La imagen original supera los 12 MB.');
      const raw=await readArtFile(file);
      if(which==='portrait')setPortrait(await processPortrait(raw));
      else setSheet(await processSpriteSheet(raw,
        ['STRAIGHT_FIREBALL','ARCING_LOB_OBJECT','BOOMERANG_RETURN','TRAP_MINE_DROP'].includes(design!.moveset.specialNeutral.mechanic)?'PROJECTILE':'KO'));
    }catch(e){setError(explain(e));}
    finally{setBusy(false);}
  };
  const save=async()=>{
    if(!design||!portrait||!sheet||busy)return;
    setBusy(true);setError('');
    try{const form={design,portraitDataUrl:portrait,spriteSheetDataUrl:sheet};await saveUltimate(base,form);onSaved(form);onClose();}
    catch(e){setError(explain(e));}
    finally{setBusy(false);}
  };
  return <div className="pb-modal-backdrop pb-ultimate-overlay" role="presentation">
    <section className="pb-frame pb-ultimate-dialog" role="dialog" aria-modal="true" aria-label={`Despertar Ultimate de ${base.fighterName}`}>
      <header className="pb-ultimate-header"><span><Crown size={19}/> DESPERTAR <small>ULTIMATE FORM · 16-BIT</small></span><button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar"><X size={18}/></button></header>
      <div className="pb-ultimate-steps" aria-label="Fases de evolución">{STEPS.map((s,i)=><span key={s} className={step===i?'active':i<step?'done':''}>{i<step?'✓':i+1} {s}</span>)}</div>
      {step===0&&<div className="pb-ultimate-content"><div className="pb-ultimate-base"><img src={base.portraitDataUrl} alt={`Forma base de ${base.fighterName}`}/><div><strong>{base.fighterName}</strong><small>EVOLUCIONA SIN PERDER EL ORIGINAL</small><p>Adjunta este retrato al prompt. Copia el JSON obtenido debajo.</p></div></div><textarea className="pb-ultimate-json" aria-label="JSON Ultimate de la IA" placeholder="PEGA AQUÍ EL JSON ULTIMATE" value={json} onChange={e=>setJson(e.target.value)}/><button type="button" className="pb-mini-button pb-gold" onClick={acceptJson} disabled={!json.trim()}><FileJson size={15}/> VALIDAR JSON</button></div>}
      {step===1&&<div className="pb-ultimate-content"><p className="pb-ultimate-tip">Adjunta el retrato base a tu IA. Genera un retrato cuadrado y súbelo.</p><div className="pb-ultimate-art">{portrait?<img src={portrait} alt="Retrato Ultimate procesado"/>:<Image size={42}/>}</div><label className="pb-mini-button pb-gold pb-ultimate-upload"><Upload size={15}/>{portrait?'CAMBIAR RETRATO':'SUBIR RETRATO'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void importArt(e.target.files?.[0],'portrait');e.target.value='';}}/></label></div>}
      {step===2&&<div className="pb-ultimate-content"><p className="pb-ultimate-tip">Adjunta spritesheet BASE + retrato ULTIMATE a tu IA. Usa verde puro #00FF00 y aura sin halos.</p><div className="pb-ultimate-art">{sheet?<img src={sheet} alt="Spritesheet Ultimate procesado"/>:<Image size={42}/>}</div><label className="pb-mini-button pb-gold pb-ultimate-upload"><Upload size={15}/>{sheet?'CAMBIAR SPRITES':'SUBIR SPRITESHEET 4×4'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void importArt(e.target.files?.[0],'sheet');e.target.value='';}}/></label></div>}
      {step===3&&design&&<div className="pb-ultimate-content"><div className="pb-ultimate-review"><img src={portrait} alt="Retrato Ultimate"/><div><strong>{design.fighterName}</strong><small>{design.subtitle}</small><p>HP {design.stats.hp} · SPD {design.stats.speed} · PWR {design.stats.power} · TEC {design.stats.technique}</p><span><ShieldCheck size={14}/> 100 PUNTOS · RANKED EQUILIBRADO</span></div></div><p className="pb-ultimate-tip">La forma base permanece intacta. Puedes alternar formas desde la ficha.</p></div>}
      {step<3&&<details className="pb-ultimate-prompt" open={step===0}><summary><ClipboardCopy size={14}/> PROMPT {STEPS[step]}</summary><button type="button" className="pb-mini-button pb-blue" onClick={()=>void copyPrompt()}><ClipboardCopy size={14}/> COPIAR PROMPT</button>{copyStatus&&<small>{copyStatus}</small>}<textarea readOnly aria-label="Prompt para copiar" value={prompt} onFocus={e=>e.target.select()}/></details>}
      {error&&<p role="alert" className="pb-ultimate-error">{error}</p>}
      <footer className="pb-ultimate-actions"><button type="button" className="pb-mini-button pb-muted" disabled={busy} onClick={()=>step?setStep(n=>n-1):onClose()}><ArrowLeft size={14}/>{step?'ATRÁS':'CANCELAR'}</button>{step===3?<button type="button" className="pb-mini-button pb-gold" disabled={busy} onClick={()=>void save()}>{busy?<Loader2 className="pb-spin" size={16}/>:<CloudUpload size={16}/>} GUARDAR EN NUBE</button>:step!==0?<button type="button" className="pb-mini-button pb-gold" disabled={busy||(step===1&&!portrait)||(step===2&&!sheet)} onClick={()=>setStep(s=>s+1)}><Check size={15}/> SIGUIENTE</button>:<span><Sparkles size={14}/> PRESTIGIO ARCADE</span>}</footer>
    </section>
  </div>;
}
