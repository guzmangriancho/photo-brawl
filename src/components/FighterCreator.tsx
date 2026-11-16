import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, CheckCircle2, ChevronRight, ClipboardCopy, CloudUpload, FileJson, Image, KeyRound, Loader2, RefreshCw, ShieldCheck, Sparkles, Upload, Trash2, Save, X } from 'lucide-react';
import type { FighterDesignSchema, FighterProfile } from '../types/fighter';
import { analyzeCreatorPhoto, buildCreatedProfile, generateCreatorPortrait, generateCreatorSheet, parseFighterDesignJson, prepareCreatorPhoto } from '../services/geminiFighterGenerator';
import type { CreatorPhoto } from '../services/geminiFighterGenerator';
import { buildAnalysisPrompt, buildPortraitPrompt, buildSpritePrompt, needsProjectileSprite } from '../services/fighterPrompts';
import { processPortrait, processSpriteSheet, readArtFile } from '../engine/SpriteProcessor';
import { getGeminiApiKey, saveCustomFighter, setGeminiApiKey } from '../services/storageService';
import { clearCreatorDraft, getCreatorDraft, saveCreatorDraft } from '../services/creatorDraftService';
import type { CreatorDraft } from '../services/creatorDraftService';
import './fighterCreator.css';

type Step = 'PHOTO' | 'SPRITE' | 'PORTRAIT' | 'FINISH';
const STEPS: { id: Step; label: string }[] = [
  {id:'PHOTO',label:'FOTO Y FICHA'}, {id:'SPRITE',label:'SPRITES'}, {id:'PORTRAIT',label:'RETRATO'}, {id:'FINISH',label:'GUARDAR'},
];

interface Props { onClose: () => void; onCreated: (fighter: FighterProfile) => void }
const friendlyError = (e: unknown) => e instanceof Error ? e.message : 'No se pudo completar la operación.';
export const FighterCreator: React.FC<Props> = ({onClose,onCreated}) => {
  const [step,setStep] = useState<Step>('PHOTO');
  const [hydrated,setHydrated] = useState(false);
  const [draftStatus,setDraftStatus] = useState<'saving'|'saved'|'restored'|'error'>('saving');
  const [discardConfirm,setDiscardConfirm] = useState(false);
  const finalizedRef = useRef(false);
  const [photoFile,setPhotoFile] = useState<File|null>(null);
  const [photoPreview,setPhotoPreview] = useState('');
  const [prepared,setPrepared] = useState<CreatorPhoto|null>(null);
  const [name,setName] = useState('');
  const [key,setKey] = useState(getGeminiApiKey);
  const [design,setDesign] = useState<FighterDesignSchema|null>(null);
  const [sprite,setSprite] = useState('');
  const [portrait,setPortrait] = useState('');
  const [spriteErr,setSpriteErr] = useState('');
  const [portraitErr,setPortraitErr] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [progress,setProgress] = useState('');
  const [showJson,setShowJson] = useState(false);
  const [json,setJson] = useState('');
  const [promptDialog,setPromptDialog] = useState<null | {title:string; value:string; copied:boolean}>(null);
  useEffect(() => () => { if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  // Restore not just the step but the actual original File, design and both generated images.
  // The Gemini key is intentionally NOT included in the draft snapshot.
  useEffect(() => {
    let cancelled = false;
    void getCreatorDraft().then(draft => {
      if (cancelled) return;
      if (draft) {
        const restoredFile = draft.photoFile
          ? new File([draft.photoFile], draft.photoFile.name || 'foto-original.jpg', {type:draft.photoFile.type || 'image/jpeg'})
          : null;
        setPhotoFile(restoredFile);
        if (restoredFile) setPhotoPreview(URL.createObjectURL(restoredFile));
        setPrepared(draft.prepared || null);
        setName(draft.name || '');
        setDesign(draft.design || null);
        setSprite(draft.sprite || '');
        setPortrait(draft.portrait || '');
        setSpriteErr(draft.spriteErr || '');
        setPortraitErr(draft.portraitErr || '');
        setJson(draft.json || '');
        setShowJson(!!draft.showJson);
        const resume = !draft.design ? 'PHOTO' : draft.step === 'FINISH' && (!draft.sprite || !draft.portrait)
          ? !draft.sprite ? 'SPRITE' : 'PORTRAIT' : draft.step;
        setStep(resume);
        setDraftStatus('restored');
      } else setDraftStatus('saved');
      setHydrated(true);
    }).catch(e => {
      if (cancelled) return;
      setHydrated(true);
      setDraftStatus('error');
      setError(`No se pudo recuperar el borrador: ${friendlyError(e)}`);
    });
    return () => { cancelled = true; };
  }, []);

  const latestDraft = useRef<Omit<CreatorDraft, 'id'|'updatedAt'>>({step:'PHOTO',photoFile:null,prepared:null,name:'',design:null,sprite:'',portrait:'',spriteErr:'',portraitErr:'',showJson:false,json:''});
  latestDraft.current = {step,photoFile,prepared,name,design,sprite,portrait,spriteErr,portraitErr,showJson,json};
  const persistNow = () => saveCreatorDraft(latestDraft.current).then(() => {
    if (!finalizedRef.current) setDraftStatus('saved');
  }).catch(e => {
    if (!finalizedRef.current) {
      setDraftStatus('error');
      setError(`No se pudo guardar el borrador: ${friendlyError(e)}. Libera espacio en el navegador.`);
    }
  });

  useEffect(() => {
    if (!hydrated || finalizedRef.current) return;
    setDraftStatus(current => current === 'restored' ? 'restored' : 'saving');
    const timer = window.setTimeout(() => { void persistNow(); }, 220);
    return () => window.clearTimeout(timer);
  }, [hydrated,step,photoFile,prepared,name,design,sprite,portrait,spriteErr,portraitErr,showJson,json]);

  useEffect(() => {
    if (!hydrated) return;
    const saveOnBackground = () => {
      if (!finalizedRef.current) void persistNow();
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') saveOnBackground(); };
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('pagehide',saveOnBackground);
    return () => { document.removeEventListener('visibilitychange',onVisibility); window.removeEventListener('pagehide',saveOnBackground); };
  }, [hydrated]);

  // Also flush when the modal closes normally (including Escape), not just on tab hiding.
  useEffect(() => () => {
    if (hydrated && !finalizedRef.current) void saveCreatorDraft(latestDraft.current);
  }, [hydrated]);

  async function closeAndSave() {
    await persistNow();
    onClose();
  }

  async function discardDraft() {
    finalizedRef.current = true;
    setDiscardConfirm(false);
    try { await clearCreatorDraft(); onClose(); }
    catch(e) { finalizedRef.current = false; setError(`No se pudo borrar el borrador: ${friendlyError(e)}`); }
  }

  const index = STEPS.findIndex(s => s.id === step);
  const lastCell = useMemo(() => design ? (needsProjectileSprite(design.moveset.specialNeutral.mechanic) ? 'PROYECTIL' : 'KO EXTRA') : '',[design]);

  async function selectPhoto(file?: File) {
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 15*1024*1024) {
      setError('Sube una foto PNG, JPG o WEBP de máximo 15 MB.'); return;
    }
    setError(''); setDesign(null); setSprite(''); setPortrait(''); setPrepared(null); setSpriteErr(''); setPortraitErr(''); setShowJson(false);
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(old => { if (old.startsWith('blob:')) URL.revokeObjectURL(old); return url; });
  }
  async function ensurePhoto(): Promise<CreatorPhoto> {
    if (prepared) return prepared;
    if (!photoFile) throw new Error('Selecciona o haz una fotografía primero.');
    const resized = await prepareCreatorPhoto(photoFile); setPrepared(resized); return resized;
  }
  function requireKey() {
    if (!key.trim()) throw new Error('Para generar automáticamente introduce la clave Gemini. También puedes copiar los prompts y subir los archivos manualmente.');
    return key.trim();
  }
  async function analyzeOnly() {
    setBusy(true);setError('');setProgress('Analizando foto y diseñando seis movimientos…');
    try {
      const photo = await ensurePhoto();
      const created = await analyzeCreatorPhoto(requireKey(), photo, name || undefined);
      setDesign(created); setSprite('');setPortrait('');setSpriteErr('');setPortraitErr('');setStep('SPRITE');
    } catch(e) { setError(friendlyError(e)); setShowJson(true); }
    finally { setBusy(false);setProgress(''); }
  }
  async function generateEverything() {
    setBusy(true);setError('');setSpriteErr('');setPortraitErr('');
    try {
      setProgress('1/3 · Analizando y equilibrando luchador…');
      const photo = await ensurePhoto();
      const apiKey = requireKey();
      // Keep design and media on independent state so one failed request cannot erase the other.
      const next = design || await analyzeCreatorPhoto(apiKey, photo, name || undefined);
      setDesign(next);
      setProgress('2/3 · Dibujando spritesheet y retrato por separado…');
      const results = await Promise.allSettled([generateCreatorSheet(apiKey,photo,next),generateCreatorPortrait(apiKey,photo,next)]);
      if (results[0].status === 'fulfilled') setSprite(results[0].value);
      else setSpriteErr(friendlyError(results[0].reason));
      if (results[1].status === 'fulfilled') setPortrait(results[1].value);
      else setPortraitErr(friendlyError(results[1].reason));
      setProgress('3/3 · Preparando revisión…');
      setStep(results[0].status === 'fulfilled' && results[1].status === 'fulfilled' ? 'FINISH' : results[0].status !== 'fulfilled' ? 'SPRITE' : 'PORTRAIT');
    } catch(e) { setError(friendlyError(e));setShowJson(true); }
    finally {setBusy(false);setProgress('');}
  }
  async function generateOne(which: 'SPRITE'|'PORTRAIT') {
    if (!design) return;
    setBusy(true); setError('');setProgress(which === 'SPRITE' ? 'Dibujando las 16 poses…' : 'Creando retrato pixel art…');
    try {
      const p = await ensurePhoto(); const api = requireKey();
      if (which === 'SPRITE') { setSprite(await generateCreatorSheet(api,p,design));setSpriteErr(''); }
      else { setPortrait(await generateCreatorPortrait(api,p,design));setPortraitErr(''); }
    } catch(e) { if (which === 'SPRITE') setSpriteErr(friendlyError(e));else setPortraitErr(friendlyError(e)); }
    finally { setBusy(false);setProgress(''); }
  }
  async function importImage(which: 'SPRITE'|'PORTRAIT', file?: File) {
    if (!file) return;
    setBusy(true);setError('');setProgress('Validando imagen importada…');
    try {
      const raw = await readArtFile(file);
      if (which === 'SPRITE') {setSprite(await processSpriteSheet(raw, design && needsProjectileSprite(design.moveset.specialNeutral.mechanic) ? 'PROJECTILE' : 'KO'));setSpriteErr('');}
      else {setPortrait(await processPortrait(raw));setPortraitErr('');}
    } catch(e) {if (which === 'SPRITE') setSpriteErr(friendlyError(e));else setPortraitErr(friendlyError(e));}
    finally {setBusy(false);setProgress('');}
  }
  function applyJson() {
    try {const parsed = parseFighterDesignJson(json,name || undefined);setDesign(parsed);setSprite('');setPortrait('');setError('');setStep('SPRITE');}
    catch(e) {setError(friendlyError(e));}
  }
  async function save() {
    if (!design||!sprite||!portrait) {setError('Se necesitan ficha, spritesheet y retrato para guardar.');return;}
    setBusy(true);setProgress('Guardando luchador en este dispositivo…');setError('');
    try {const profile = buildCreatedProfile(design,sprite,portrait);await saveCustomFighter(profile);finalizedRef.current=true;try { await clearCreatorDraft(); } catch(e) { console.warn('El personaje se guardó, pero no pudo limpiarse el borrador:',e); }onCreated(profile);}
    catch(e){setError(`${friendlyError(e)} Comprueba el espacio disponible en el navegador.`);}
    finally {setBusy(false);setProgress('');}
  }
  function showPrompt(which:'PHOTO'|'SPRITE'|'PORTRAIT') {
    const value = which === 'PHOTO' ? buildAnalysisPrompt(name) : which === 'SPRITE' && design ? buildSpritePrompt(design) : design ? buildPortraitPrompt(design) : '';
    if (!value) return;
    void persistNow();
    setPromptDialog({title:which === 'PHOTO'?'ANÁLISIS JSON':which === 'SPRITE'?'SPRITESHEET 4×4':'RETRATO 512×512',value,copied:false});
  }
  async function copyPrompt() {
    if (!promptDialog) return;
    // Save concurrently: awaiting storage BEFORE clipboard.writeText loses the mobile user gesture.
    void persistNow();
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API not available');
      await navigator.clipboard.writeText(promptDialog.value);
      setPromptDialog({...promptDialog,copied:true});
    } catch {
      // HTTP on a physical phone often lacks the Clipboard API. The select-all prompt is always visible.
      const area = document.getElementById('pb-prompt-textarea') as HTMLTextAreaElement|null;
      area?.focus();area?.select();
      try {if (!document.execCommand('copy')) throw new Error();setPromptDialog({...promptDialog,copied:true});}
      catch {setPromptDialog({...promptDialog,copied:false});setError('Selecciona y copia el texto del prompt manualmente.');}
    }
  }
  const ready = !!(design && sprite && portrait);
  return <div className="pb-modal-backdrop pb-creator-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget&&!busy) void closeAndSave();}}>
    <section className="pb-frame pb-creator" role="dialog" aria-modal="true" aria-label="Crear luchador con foto">
      <div className="pb-creator-top"><div className="pb-creator-title"><Sparkles size={19}/><div><strong>CREADOR DE LUCHADORES</strong><small>PERSONAJE COMPLETO · 16-BIT</small></div></div><div className="pb-draft-controls"><span className={`pb-draft-indicator pb-draft-${draftStatus}`} aria-live="polite"><Save size={12}/>{draftStatus==='restored'?'RECUPERADO':draftStatus==='saved'?'GUARDADO':draftStatus==='error'?'ERROR AL GUARDAR':'GUARDANDO'}</span><button type="button" className="pb-creator-exit" disabled={busy} aria-label="Cerrar creador, mantener borrador" onClick={()=>void closeAndSave()}><X size={19}/></button></div></div>
      {!hydrated ? <div className="pb-creator-recover" role="status"><Loader2 size={22} className="pb-spin"/> RECUPERANDO BORRADOR…</div> : <><nav className="pb-creator-steps" aria-label="Pasos de creación">{STEPS.map((entry,i)=><button type="button" key={entry.id} disabled={busy || i>0 && !design || i>index && !(entry.id==='FINISH' && ready)} aria-current={entry.id===step?'step':undefined} className={entry.id===step?'on':i<index?'done':''} onClick={()=>{setStep(entry.id);setError('');}}><span>{i<index?<Check size={11}/>:i+1}</span><b>{entry.label}</b></button>)}</nav>
      <div className="pb-creator-body">
        {step==='PHOTO' && <div className="pb-creator-columns">
          <div className="pb-creator-photo-side"><label className="pb-creator-upload-photo"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void selectPhoto(e.target.files?.[0])} disabled={busy}/>{photoPreview?<img src={photoPreview} alt="Foto original seleccionada"/>:<><Camera size={39}/><strong>SUBIR O HACER FOTO</strong></>}<span>{photoFile?.name||'PNG · JPG · WEBP'}</span></label><small>Usa una fotografía propia o con permiso. Se enviará a Gemini solo cuando generes con IA.</small></div>
          <div className="pb-creator-details"><label className="pb-creator-field">NOMBRE DEL LUCHADOR <small>(opcional)</small><input maxLength={16} value={name} disabled={busy||!!design} placeholder="La IA puede inventarlo" onChange={e=>setName(e.target.value)}/></label><label className="pb-creator-field">CLAVE GEMINI <small>(para generación automática)</small><input value={key} type="password" autoComplete="off" disabled={busy} placeholder="Si no tienes, usa modo manual" onChange={e=>setKey(e.target.value)}/></label><div className="pb-creator-keyhelp"><KeyRound size={13}/> Se usa desde este navegador. <button type="button" onClick={()=>{setGeminiApiKey(key);setError('Clave guardada localmente para pruebas.');}}>GUARDAR CLAVE</button></div><p className="pb-creator-micro">Genera la ficha real: <b>4 estadísticas, arquetipo, pasiva, seis movimientos, coreografías y arte.</b></p><div className="pb-creator-actions-stack"><button type="button" className="pb-mini-button pb-gold" disabled={!photoFile||busy} onClick={()=>void generateEverything()}><Sparkles size={16}/> {design?'GENERAR IMÁGENES':'GENERAR TODO CON IA'}</button><div className="pb-creator-inline"><button type="button" className="pb-mini-button pb-blue" disabled={!photoFile||busy} onClick={()=>void analyzeOnly()}><FileJson size={14}/> SOLO ANÁLISIS</button><button type="button" className="pb-mini-button pb-muted" onClick={()=>showPrompt('PHOTO')}><ClipboardCopy size={14}/> COPIAR PROMPT</button></div><button type="button" className="pb-creator-text-link" onClick={()=>setShowJson(v=>!v)}>{showJson?'OCULTAR JSON MANUAL':'PEGAR ANÁLISIS JSON MANUAL'}</button></div></div>
          {showJson && <div className="pb-creator-json-editor"><button type="button" className="pb-creator-json-close" onClick={()=>setShowJson(false)}>CERRAR JSON ×</button><textarea aria-label="JSON del personaje" value={json} onChange={e=>setJson(e.target.value)} placeholder="Pega aquí el JSON generado por Gemini con la foto original…"/><button type="button" className="pb-mini-button pb-purple" disabled={!json.trim()||busy} onClick={applyJson}>VALIDAR FICHA</button></div>}
        </div>}
        {(step==='SPRITE'||step==='PORTRAIT')&&design&&<div className="pb-creator-columns pb-creator-art-step"><div className="pb-creator-art-side"><div className={`pb-creator-art-viewport ${step==='SPRITE'?'is-sheet':'is-portrait'}`}>
          {step==='SPRITE'?(sprite?<img src={sprite} alt="Spritesheet 4x4 de 16 celdas"/>:<div className="pb-creator-art-placeholder"><Image size={38}/><span>16 POSES · 4 × 4</span></div>):(portrait?<img src={portrait} alt="Retrato pixel art del luchador"/>:<div className="pb-creator-art-placeholder"><Image size={38}/><span>RETRATO 512 × 512</span></div>)}
        </div><div className="pb-creator-art-status">{(step==='SPRITE'?sprite:portrait)?<><CheckCircle2 size={15}/> IMAGEN LISTA PARA JUGAR</>:<><CloudUpload size={15}/> IMAGEN PENDIENTE</>}</div></div>
        <div className="pb-creator-art-info"><h3>{step==='SPRITE'?'SPRITESHEET PERSONALIZADO':'RETRATO DE SELECCIÓN'}</h3><p>{step==='SPRITE'?`Adaptado a sus seis movimientos: preparación + impacto en ataques, especiales exclusivos y celda 16 para ${lastCell.toLowerCase()}.`: 'Retrato del personaje con su aspecto real adaptado al mismo pixel art que el combate.'}</p><div className="pb-creator-fighter-mini"><strong>{design.fighterName}</strong><small>{design.subtitle}</small></div>
          <button type="button" className="pb-mini-button pb-gold" onClick={()=>void generateOne(step)} disabled={busy}><RefreshCw size={14}/> {step==='SPRITE'?'GENERAR SPRITES CON IA':'GENERAR RETRATO CON IA'}</button>
          <div className="pb-creator-inline"><button type="button" className="pb-mini-button pb-muted" onClick={()=>showPrompt(step)}><ClipboardCopy size={14}/> COPIAR PROMPT</button><label className="pb-mini-button pb-purple pb-creator-file-button"><Upload size={14}/> SUBIR IMAGEN<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void importImage(step,e.target.files?.[0]);e.target.value='';}}/></label></div>
          <small className="pb-creator-instructions">Si Gemini falla: copia el prompt, adjunta la <b>foto original</b> en Gemini web, descarga el resultado y súbelo aquí. No se pierde la ficha ni la otra imagen.</small>
          {(step==='SPRITE'?spriteErr:portraitErr)&&<p className="pb-creator-asset-error" role="alert">{step==='SPRITE'?spriteErr:portraitErr}</p>}
        </div></div>}
        {step==='FINISH' && design && <div className="pb-creator-review"><div className="pb-creator-review-images">{portrait?<img className="pb-creator-review-portrait" src={portrait} alt="Retrato final"/>:<div className="pb-creator-review-empty">FALTA RETRATO</div>}{sprite?<div className="pb-creator-review-sprite" style={{backgroundImage:`url('${sprite}')`}} aria-label="Pose de combate"/>:<div className="pb-creator-review-empty">FALTAN SPRITES</div>}</div><div className="pb-creator-review-details"><h3>{design.fighterName}</h3><small>{design.subtitle}</small><div className="pb-creator-review-stats">{Object.entries(design.stats).map(([k,v])=><span key={k}><b>{k.toUpperCase()}</b> {v}</span>)}</div><div className="pb-creator-review-trait"><ShieldCheck size={13}/> {design.passiveTrait.replace(/_/g,' ')} · {design.archetype.replace(/_/g,' ')}</div><div className="pb-creator-review-moves">{Object.entries(design.moveset).map(([k,m])=><span key={k}>{(m as {name:string}).name}</span>)}</div><p>Las estadísticas y técnicas se guardan exactamente como se jugarán en el motor. Solo podrás iniciar un combate desde Inicio.</p></div></div>}
      </div>
      {error&&<div role="alert" className="pb-creator-alert">{error}</div>}
      {busy&&<div className="pb-creator-progress" role="status"><Loader2 size={16} className="pb-spin"/>{progress}</div>}
      <div className="pb-creator-bottom"><button type="button" className="pb-mini-button pb-muted" disabled={busy} onClick={()=>{if(index===0)void closeAndSave();else {setStep(STEPS[index-1].id);setError('');}}}><ArrowLeft size={15}/>{index===0?'CANCELAR':'ATRÁS'}</button><div className="pb-creator-footnote"><span>{index+1} / 4 · {design?'FICHA LISTA':'SIN FICHA'}</span><button type="button" onClick={()=>setDiscardConfirm(true)} disabled={busy} title="Descartar todo el borrador"><Trash2 size={11}/> BORRAR</button></div>{step==='FINISH'?<button type="button" className="pb-mini-button pb-gold" onClick={()=>void save()} disabled={!ready||busy}><Check size={15}/> GUARDAR LUCHADOR</button>:<button type="button" className="pb-mini-button pb-blue" disabled={busy || !design || step==='PHOTO'||step==='SPRITE'&&!sprite||step==='PORTRAIT'&&!portrait} onClick={()=>{setStep(STEPS[index+1].id);setError('');}}>SIGUIENTE <ChevronRight size={15}/></button>}</div>
      {discardConfirm&&<div className="pb-creator-prompt-shade"><section className="pb-creator-delete-confirm" role="alertdialog" aria-modal="true" aria-label="Borrar borrador"><strong>¿DESCARTAR PERSONAJE?</strong><p>Se eliminarán la foto, la ficha y las imágenes de este borrador. Cerrar con × no los elimina.</p><div><button type="button" className="pb-mini-button pb-muted" onClick={()=>setDiscardConfirm(false)}>CONSERVAR</button><button type="button" className="pb-mini-button pb-red" onClick={()=>void discardDraft()}><Trash2 size={14}/> BORRAR TODO</button></div></section></div>}
      {promptDialog&&<div className="pb-creator-prompt-shade"><section className="pb-creator-prompt" role="dialog" aria-label="Prompt para generación manual"><div className="pb-creator-prompt-head"><strong>PROMPT: {promptDialog.title}</strong><button type="button" onClick={()=>setPromptDialog(null)} aria-label="Cerrar prompt"><X size={17}/></button></div><p>Adjunta la misma foto original junto a este texto en Gemini web. Después importa el resultado en este creador.</p><textarea id="pb-prompt-textarea" aria-label="Texto del prompt para copiar" readOnly value={promptDialog.value} onFocus={e=>e.currentTarget.select()}/><div className="pb-creator-prompt-actions"><button type="button" className="pb-mini-button pb-gold" onClick={()=>void copyPrompt()}><ClipboardCopy size={14}/>{promptDialog.copied?'¡COPIADO!':'COPIAR PROMPT'}</button><button type="button" className="pb-mini-button pb-muted" onClick={()=>setPromptDialog(null)}>VOLVER</button></div></section></div>}
      </>}
    </section>
  </div>;
};
