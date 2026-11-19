import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, CheckCircle2, ChevronRight, ClipboardCopy, CloudUpload, FileJson, Image, KeyRound, Loader2, RefreshCw, ShieldCheck, Sparkles, Upload, Trash2, Save, X, HelpCircle, ExternalLink } from 'lucide-react';
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
type CreatorMode = 'guided' | 'automatic';
const STEPS: { id: Step; label: string }[] = [
  {id:'PHOTO',label:'FICHA'}, {id:'SPRITE',label:'SPRITES'}, {id:'PORTRAIT',label:'RETRATO'}, {id:'FINISH',label:'GUARDAR'},
];

const CHAT_SERVICES = [
  {label:'GEMINI',url:'https://gemini.google.com/app'},
  {label:'CHATGPT',url:'https://chatgpt.com/'},
] as const;
const GUIDE_STEPS = [
  {title:'1 · CREA LA FICHA', intro:'IMPORTANTE: adjunta tu foto original en el chat de IA, junto al prompt.', details:'1. Pulsa COPIAR PROMPT. 2. Abre Gemini o ChatGPT, pega el prompt y adjunta tu foto original directamente en ese chat, en el mismo mensaje, antes de enviarlo. 3. Copia la respuesta de la IA, vuelve al juego y pulsa PEGAR RESPUESTA. La ficha se validará automáticamente. No hace falta subir la foto a PHOTO BRAWL en el modo guiado.'},
  {title:'2 · SPRITESHEET', intro:'La ficha define los ataques, por eso los sprites se hacen después.', details:'Copia el prompt del spritesheet 4×4. Continúa en el mismo chat de IA y adjunta de nuevo la foto si es necesario. Descarga el archivo de imagen PNG, JPG o WEBP y súbelo con SUBIR IMAGEN.'},
  {title:'3 · RETRATO', intro:'Ahora crea un retrato para la selección de luchadores.', details:'Copia el prompt de retrato y envíalo en tu chat con la foto original. Descarga el retrato y usa SUBIR IMAGEN para importarlo. No es necesario repetir el spritesheet.'},
  {title:'4 · REVISAR Y GUARDAR', intro:'Comprueba el resultado antes de incorporarlo a tu colección.', details:'Revisa el retrato, los movimientos y las estadísticas. Si algo falla, vuelve al paso correspondiente. Pulsa GUARDAR LUCHADOR cuando estén listas ambas imágenes.'},
] as const;
interface Props { onClose: () => void; onCreated: (fighter: FighterProfile) => void }
const friendlyError = (e: unknown) => e instanceof Error ? e.message : 'No se pudo completar la operación.';
export const FighterCreator: React.FC<Props> = ({onClose,onCreated}) => {
  const [step,setStep] = useState<Step>('PHOTO');
  const [mode,setMode] = useState<CreatorMode>('guided');
  const [guideStep,setGuideStep] = useState<number|null>(null);
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
  const [showChatChoices,setShowChatChoices] = useState(false);
  const [json,setJson] = useState('');
  const [promptDialog,setPromptDialog] = useState<null | {title:string; value:string; which:'PHOTO'|'SPRITE'|'PORTRAIT'}>(null);
  const [copiedPrompt,setCopiedPrompt] = useState<'PHOTO'|'SPRITE'|'PORTRAIT'|null>(null);
  const [pasteHint,setPasteHint] = useState('');
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
        setMode(draft.mode === 'automatic' ? 'automatic' : 'guided');
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

  const latestDraft = useRef<Omit<CreatorDraft, 'id'|'updatedAt'>>({step:'PHOTO',mode:'guided',photoFile:null,prepared:null,name:'',design:null,sprite:'',portrait:'',spriteErr:'',portraitErr:'',showJson:false,json:''});
  latestDraft.current = {step,mode,photoFile,prepared,name,design,sprite,portrait,spriteErr,portraitErr,showJson,json};
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
  }, [hydrated,step,mode,photoFile,prepared,name,design,sprite,portrait,spriteErr,portraitErr,showJson,json]);

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
  // Accept an entire pasted response and advance only after schema validation succeeds.
  // An invalid response stays editable; a partial response never overwrites the current fighter.
  function applyJson(value: string, reportError = true): boolean {
    setJson(value);
    try {
      const parsed = parseFighterDesignJson(value, name || undefined);
      setDesign(parsed);
      setSprite(''); setPortrait(''); setSpriteErr(''); setPortraitErr('');
      setError(''); setPasteHint(''); setShowJson(false); setStep('SPRITE');
      return true;
    } catch(e) {
      if (reportError) { setError(friendlyError(e)); setShowJson(true); }
      return false;
    }
  }
  // A single click reads the clipboard and validates it. iOS/Safari and non-HTTPS
  // contexts may refuse readText; the fallback auto-validates a normal Paste event.
  async function pasteAndValidate() {
    setError(''); setPasteHint('');
    try {
      if (!navigator.clipboard?.readText) throw new Error('clipboard unavailable');
      const pasted = await navigator.clipboard.readText();
      if (!pasted.trim()) {
        setShowJson(true);
        setPasteHint('Tu portapapeles está vacío. Copia la respuesta del chat y vuelve a pegarla.');
        return;
      }
      applyJson(pasted);
    } catch {
      setShowJson(true);
      setPasteHint('Este navegador no permite pegar automáticamente. Mantén pulsado en la caja y elige PEGAR: se validará al instante.');
    }
  }
  async function save() {
    if (!design||!sprite||!portrait) {setError('Se necesitan ficha, spritesheet y retrato para guardar.');return;}
    setBusy(true);setProgress('Guardando luchador en este dispositivo…');setError('');
    try {const profile = buildCreatedProfile(design,sprite,portrait);await saveCustomFighter(profile);finalizedRef.current=true;try { await clearCreatorDraft(); } catch(e) { console.warn('El personaje se guardó, pero no pudo limpiarse el borrador:',e); }onCreated(profile);}
    catch(e){setError(`${friendlyError(e)} Comprueba el espacio disponible en el navegador.`);}
    finally {setBusy(false);setProgress('');}
  }
  // Fall back to the browser's legacy selection API when Clipboard API is unavailable.
  // Only expose the raw prompt if BOTH automatic methods fail.
  function legacyCopy(text: string): boolean {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed'; field.style.left = '-10000px';
    field.style.top = '0'; field.style.opacity = '0';
    document.body.appendChild(field);
    field.focus(); field.select();
    let succeeded = false;
    try { succeeded = document.execCommand('copy'); } catch { /* Browser disabled it. */ }
    field.remove();
    return succeeded;
  }
  function showPrompt(which:'PHOTO'|'SPRITE'|'PORTRAIT') {
    const value = which === 'PHOTO' ? buildAnalysisPrompt(name) : which === 'SPRITE' && design ? buildSpritePrompt(design) : design ? buildPortraitPrompt(design) : '';
    if (!value) return;
    // Start the clipboard operation synchronously from the button click.
    const success = () => { setCopiedPrompt(which); setPromptDialog(null); setError(''); };
    const failure = () => {
      if (legacyCopy(value)) success();
      else setPromptDialog({title:which==='PHOTO'?'FICHA DEL LUCHADOR':which==='SPRITE'?'SPRITESHEET 4×4':'RETRATO 512×512',value,which});
    };
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(value).then(success).catch(failure);
    else failure();
    void persistNow();
  }
  // An edited name changes the analysis prompt; switching step changes its context.
  useEffect(() => { setCopiedPrompt(null); }, [name, design, step]);
  const ready = !!(design && sprite && portrait);
  const unlocked = !design ? 0 : !sprite ? 1 : !portrait ? 2 : 3;
  const providerLinks = <div className="pb-creator-provider-row" aria-label="Elegir herramienta de IA">{CHAT_SERVICES.map(service=><a href={service.url} key={service.label} target="_blank" rel="noopener noreferrer" onClick={()=>{void persistNow();setShowChatChoices(false);}}><span>{service.label}</span><ExternalLink size={11}/></a>)}</div>;
  const chatChooser = <div className="pb-creator-chat-chooser"><button type="button" className="pb-mini-button pb-blue pb-creator-full-action pb-creator-choose-chat" aria-expanded={showChatChoices} onClick={()=>setShowChatChoices(v=>!v)}><ExternalLink size={13}/> 2 · ABRIR MI IA <ChevronRight size={13} className={showChatChoices?'pb-rotate-down':''}/></button>{showChatChoices&&providerLinks}</div>;
  const artStep = step === 'SPRITE' ? 'SPRITE' : 'PORTRAIT';
  const artDone = step === 'SPRITE' ? !!sprite : !!portrait;
  return <div className="pb-modal-backdrop pb-creator-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget&&!busy) void closeAndSave();}}>
    <section className="pb-frame pb-creator" role="dialog" aria-modal="true" aria-label="Crear luchador con foto">
      <div className="pb-creator-top"><div className="pb-creator-title"><Sparkles size={19}/><div><strong>CREA TU LUCHADOR</strong><small>{mode==='guided'?'CREACIÓN GUIADA · 4 PASOS':'GENERACIÓN AUTOMÁTICA · GEMINI'}</small></div></div><div className="pb-draft-controls"><button type="button" className="pb-creator-help-button" onClick={()=>setGuideStep(index)}><HelpCircle size={14}/> ¿CÓMO SE HACE?</button><span className={`pb-draft-indicator pb-draft-${draftStatus}`} aria-live="polite"><Save size={12}/>{draftStatus==='restored'?'RECUPERADO':draftStatus==='saved'?'GUARDADO':draftStatus==='error'?'ERROR AL GUARDAR':'GUARDANDO'}</span><button type="button" className="pb-creator-exit" disabled={busy} aria-label="Cerrar creador, mantener borrador" onClick={()=>void closeAndSave()}><X size={19}/></button></div></div>
      {!hydrated ? <div className="pb-creator-recover" role="status"><Loader2 size={22} className="pb-spin"/> RECUPERANDO BORRADOR…</div> : <><nav className="pb-creator-steps" aria-label="Pasos de creación">{STEPS.map((entry,i)=><button type="button" key={entry.id} disabled={busy || i>unlocked} aria-current={entry.id===step?'step':undefined} className={entry.id===step?'on':i<index?'done':''} onClick={()=>{setStep(entry.id);setError('');}}><span>{i<index?<Check size={11}/>:i+1}</span><b>{entry.label}</b></button>)}</nav>
      <div className="pb-creator-body">
        {step==='PHOTO' && (mode==='guided' ? <div className="pb-creator-columns pb-creator-manual-layout">
          <div className="pb-creator-manual-steps" aria-label="Pasos para crear la ficha">
            <div className="pb-creator-manual-heading"><span className="pb-creator-mode-tag">SIN API KEY</span><strong>CREAR FICHA</strong></div>
            <div className="pb-creator-manual-step"><span>01</span><p><strong>Copia el prompt</strong><small>Incluye las instrucciones del personaje.</small></p></div>
            <div className="pb-creator-manual-step pb-creator-photo-reminder"><span>02</span><p><strong>PEGA EL PROMPT + ADJUNTA TU FOTO</strong><small>En Gemini o ChatGPT, antes de enviar el mensaje.</small></p></div>
            <div className="pb-creator-manual-step"><span>03</span><p><strong>Pega y continúa</strong><small>La ficha se valida automáticamente.</small></p></div>
            <div className="pb-creator-manual-note"><Camera size={13}/> La foto se sube EN EL CHAT DE IA, no aquí.</div>
          </div>
          <div className="pb-creator-details pb-creator-manual-controls">
            <label className="pb-creator-field">NOMBRE <small>(opcional)</small><input maxLength={16} value={name} disabled={busy||!!design} placeholder="La IA puede inventarlo" onChange={e=>setName(e.target.value)}/></label>
            <div className="pb-creator-manual-actions">
              <button type="button" className="pb-mini-button pb-gold pb-creator-full-action" aria-live="polite" aria-label={copiedPrompt==='PHOTO'?'Prompt copiado':'Copiar prompt de ficha'} disabled={busy} onClick={()=>showPrompt('PHOTO')}><ClipboardCopy size={15}/> {copiedPrompt==='PHOTO'?'✓ ¡COPIADO!':'1 · COPIAR PROMPT'}</button>
              {chatChooser}
              <button type="button" className="pb-mini-button pb-purple pb-creator-full-action" aria-label="3 · PEGAR JSON Y VALIDAR" disabled={busy} onClick={()=>void pasteAndValidate()}><FileJson size={15}/> 3 · PEGAR RESPUESTA</button>
            </div>
            <button type="button" className="pb-creator-mode-link" onClick={()=>{setMode('automatic');setShowChatChoices(false);}}><KeyRound size={13}/> TENGO API KEY · HACERLO AUTOMÁTICO <ChevronRight size={13}/></button>
          </div>
        </div> : <div className="pb-creator-columns pb-creator-photo-step pb-creator-auto-layout">
          <div className="pb-creator-photo-side"><label className="pb-creator-upload-photo"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void selectPhoto(e.target.files?.[0])} disabled={busy}/>{photoPreview?<img src={photoPreview} alt="Foto original seleccionada"/>:<><Camera size={35}/><strong>FOTO ORIGINAL</strong></>}<span>{photoFile?.name||'SUBIR O HACER FOTO'}</span></label><small>Obligatoria para la generación automática. Solo se envía a Gemini.</small></div>
          <div className="pb-creator-details pb-creator-auto-controls"><div className="pb-creator-auto-heading"><span className="pb-creator-mode-tag">CON API KEY</span><strong>GENERACIÓN AUTOMÁTICA</strong></div>
            <label className="pb-creator-field">NOMBRE <small>(opcional)</small><input maxLength={16} value={name} disabled={busy||!!design} placeholder="La IA puede inventarlo" onChange={e=>setName(e.target.value)}/></label>
            <label className="pb-creator-field">CLAVE GEMINI<input value={key} type="password" autoComplete="off" disabled={busy} placeholder="Pega tu API key" onChange={e=>setKey(e.target.value)}/></label>
            <button type="button" className="pb-mini-button pb-gold pb-creator-full-action" disabled={!photoFile||!key.trim()||busy} onClick={()=>{setGeminiApiKey(key.trim());void generateEverything();}}><Sparkles size={16}/> {design?'GENERAR IMÁGENES':'GENERAR PERSONAJE COMPLETO'}</button>
            <button type="button" className="pb-creator-mode-link" onClick={()=>{setMode('guided');setShowJson(false);}}><ArrowLeft size={13}/> VOLVER A CREACIÓN SIN CLAVE</button>
            <small className="pb-creator-api-warning">Tu clave se usa desde este navegador. No introduzcas claves privadas de otros servicios.</small>
          </div>
        </div>)}
        {step==='PHOTO' && showJson && <div className="pb-creator-json-editor"><div className="pb-creator-json-heading"><strong>PEGA LA RESPUESTA DEL CHAT</strong><button type="button" className="pb-creator-json-close" onClick={()=>{setShowJson(false);setError('');setPasteHint('');}}>VOLVER ×</button></div><p>{pasteHint||'Pega la respuesta aquí. En cuanto esté completa, se validará y pasarás a SPRITES automáticamente.'}</p><textarea aria-label="Respuesta del personaje para validar automáticamente" value={json} onPaste={e=>{const text=e.clipboardData.getData('text/plain');if(text.trim()){e.preventDefault();applyJson(text);}}} onChange={e=>{const text=e.target.value;setJson(text);if(error)setError('');if(text.length>100 && /}\s*(?:```)?\s*$/.test(text))applyJson(text,false);}} placeholder="Mantén pulsado y pulsa PEGAR"/>{error&&<p role="alert" className="pb-creator-json-error">{error}</p>}<small className="pb-creator-auto-validate"><CheckCircle2 size={13}/> VALIDACIÓN AUTOMÁTICA AL PEGAR · SIN BOTÓN EXTRA</small></div>}
        {(step==='SPRITE'||step==='PORTRAIT')&&design&&<div className="pb-creator-columns pb-creator-art-step"><div className="pb-creator-art-side"><div className={`pb-creator-art-viewport ${step==='SPRITE'?'is-sheet':'is-portrait'}`}>
          {step==='SPRITE'?(sprite?<img src={sprite} alt="Spritesheet 4x4 de 16 celdas"/>:<div className="pb-creator-art-placeholder"><Image size={38}/><span>16 POSES · 4 × 4</span></div>):(portrait?<img src={portrait} alt="Retrato pixel art del luchador"/>:<div className="pb-creator-art-placeholder"><Image size={38}/><span>RETRATO 512 × 512</span></div>)}
        </div><div className="pb-creator-art-status">{(step==='SPRITE'?sprite:portrait)?<><CheckCircle2 size={15}/> IMAGEN LISTA PARA JUGAR</>:<><CloudUpload size={15}/> IMAGEN PENDIENTE</>}</div></div>
        <div className="pb-creator-art-info"><div className="pb-creator-art-heading"><span className="pb-creator-mode-tag">{step==='SPRITE'?'2 · 4×4 · 16 POSES':'3 · 512×512'}</span><h3>{step==='SPRITE'?'SPRITESHEET':'RETRATO PIXEL ART'}</h3></div>
          <p className="pb-creator-art-summary">{step==='SPRITE'?`16 celdas adaptadas a sus ataques. Última celda: ${lastCell.toLowerCase()}.`:'Imagen cuadrada para la selección de personajes.'}</p>
          {mode==='automatic' && <button type="button" className="pb-mini-button pb-blue pb-creator-full-action" onClick={()=>void generateOne(artStep)} disabled={busy||!key.trim()}><Sparkles size={14}/> {step==='SPRITE'?'GENERAR SPRITES CON MI CLAVE':'GENERAR RETRATO CON MI CLAVE'}</button>}
          <div className="pb-creator-art-manual"><strong>{artDone?'IMAGEN CARGADA · PUEDES CONTINUAR':'GENÉRALA EN TU CHAT DE IA'}</strong>
          <button type="button" className="pb-mini-button pb-gold pb-creator-full-action" aria-live="polite" onClick={()=>showPrompt(artStep)}><ClipboardCopy size={14}/> {copiedPrompt===artStep?'✓ ¡COPIADO!':'1 · COPIAR PROMPT'}</button>
          {chatChooser}
          <div className="pb-creator-image-actions" role="group" aria-label={`Importar ${step==='SPRITE'?'spritesheet':'retrato'}`}>
            <label className="pb-mini-button pb-purple pb-creator-file-button" aria-label={step==='SPRITE'?'SUBIR SPRITESHEET':'SUBIR RETRATO'}><Upload size={14}/> SUBIR IMAGEN<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void importImage(artStep,e.target.files?.[0]);e.target.value='';}}/></label>
          </div>
          <small>Descarga la imagen del chat como PNG, JPG o WEBP y pulsa SUBIR IMAGEN.</small></div>
          {(step==='SPRITE'?spriteErr:portraitErr)&&<p className="pb-creator-asset-error" role="alert">{step==='SPRITE'?spriteErr:portraitErr}</p>}
        </div></div>}
        {step==='FINISH' && design && <div className="pb-creator-review"><div className="pb-creator-review-images">{portrait?<img className="pb-creator-review-portrait" src={portrait} alt="Retrato final"/>:<div className="pb-creator-review-empty">FALTA RETRATO</div>}{sprite?<div className="pb-creator-review-sprite" style={{backgroundImage:`url('${sprite}')`}} aria-label="Pose de combate"/>:<div className="pb-creator-review-empty">FALTAN SPRITES</div>}</div><div className="pb-creator-review-details"><h3>{design.fighterName}</h3><small>{design.subtitle}</small><div className="pb-creator-review-stats">{Object.entries(design.stats).map(([k,v])=><span key={k}><b>{k.toUpperCase()}</b> {v}</span>)}</div><div className="pb-creator-review-trait"><ShieldCheck size={13}/> {design.passiveTrait.replace(/_/g,' ')} · {design.archetype.replace(/_/g,' ')}</div><div className="pb-creator-review-moves">{Object.entries(design.moveset).map(([k,m])=><span key={k}>{(m as {name:string}).name}</span>)}</div><p>Las estadísticas y técnicas se guardan exactamente como se jugarán en el motor. Solo podrás iniciar un combate desde Inicio.</p></div></div>}
      </div>
      {error&&<div role="alert" className="pb-creator-alert">{error}</div>}
      {busy&&<div className="pb-creator-progress" role="status"><Loader2 size={16} className="pb-spin"/>{progress}</div>}
      <div className="pb-creator-bottom"><button type="button" className="pb-mini-button pb-muted" disabled={busy} onClick={()=>{if(index===0)void closeAndSave();else {setStep(STEPS[index-1].id);setError('');}}}><ArrowLeft size={15}/>{index===0?'CANCELAR':'ATRÁS'}</button><div className="pb-creator-footnote"><span>{index+1} / 4 · {design?'FICHA LISTA':'SIN FICHA'}</span><button type="button" onClick={()=>setDiscardConfirm(true)} disabled={busy} title="Descartar todo el borrador"><Trash2 size={11}/> BORRAR</button></div>{step==='FINISH'?<button type="button" className="pb-mini-button pb-gold" onClick={()=>void save()} disabled={!ready||busy}><Check size={15}/> GUARDAR LUCHADOR</button>:<button type="button" className="pb-mini-button pb-blue" disabled={busy || !design || step==='PHOTO'||step==='SPRITE'&&!sprite||step==='PORTRAIT'&&!portrait} onClick={()=>{setStep(STEPS[index+1].id);setError('');}}>SIGUIENTE <ChevronRight size={15}/></button>}</div>
      {guideStep!==null && <div className="pb-creator-prompt-shade"><section className="pb-creator-help-dialog" role="dialog" aria-modal="true" aria-label="Cómo crear tu luchador"><div className="pb-creator-prompt-head"><strong>¿CÓMO CREAR TU LUCHADOR?</strong><button type="button" onClick={()=>setGuideStep(null)} aria-label="Cerrar ayuda"><X size={17}/></button></div><div className="pb-creator-guide-progress">{GUIDE_STEPS.map((item,i)=><button type="button" key={item.title} onClick={()=>setGuideStep(i)} className={i===guideStep?'active':''} aria-current={i===guideStep?'step':undefined}>{i+1}</button>)}</div><div className="pb-creator-help-content"><div className="pb-creator-help-icon">{guideStep===0?<Camera size={36}/>:guideStep===1?<Image size={36}/>:guideStep===2?<Upload size={36}/>:<ShieldCheck size={36}/>}</div><h3>{GUIDE_STEPS[guideStep].title}</h3><p className="pb-creator-help-lead">{GUIDE_STEPS[guideStep].intro}</p><p>{GUIDE_STEPS[guideStep].details}</p><small>El borrador se guarda en este dispositivo mientras cambias a la IA.</small></div><div className="pb-creator-help-actions"><button type="button" className="pb-mini-button pb-muted" disabled={guideStep===0} onClick={()=>setGuideStep(s=>s===null?0:Math.max(0,s-1))}><ArrowLeft size={13}/> ANTERIOR</button><button type="button" className="pb-mini-button pb-gold" onClick={()=>guideStep===3?setGuideStep(null):setGuideStep(guideStep+1)}>{guideStep===3?'EMPEZAR':'SIGUIENTE'} <ChevronRight size={13}/></button></div></section></div>}
      {discardConfirm&&<div className="pb-creator-prompt-shade"><section className="pb-creator-delete-confirm" role="alertdialog" aria-modal="true" aria-label="Borrar borrador"><strong>¿DESCARTAR PERSONAJE?</strong><p>Se eliminarán la foto, la ficha y las imágenes de este borrador. Cerrar con × no los elimina.</p><div><button type="button" className="pb-mini-button pb-muted" onClick={()=>setDiscardConfirm(false)}>CONSERVAR</button><button type="button" className="pb-mini-button pb-red" onClick={()=>void discardDraft()}><Trash2 size={14}/> BORRAR TODO</button></div></section></div>}
      {promptDialog&&<div className="pb-creator-prompt-shade"><section className="pb-creator-prompt" role="dialog" aria-label="Copiar prompt manualmente"><div className="pb-creator-prompt-head"><strong>COPIAR PROMPT · {promptDialog.title}</strong><button type="button" onClick={()=>setPromptDialog(null)} aria-label="Cerrar prompt"><X size={17}/></button></div><p>Tu navegador ha bloqueado la copia automática. Selecciona el texto y cópialo manualmente. En una PWA con HTTPS normalmente no necesitarás esta pantalla.</p><textarea id="pb-prompt-textarea" aria-label="Texto del prompt para copiar" readOnly value={promptDialog.value} onFocus={e=>e.currentTarget.select()}/><div className="pb-creator-prompt-actions"><button type="button" className="pb-mini-button pb-gold" onClick={()=>showPrompt(promptDialog.which)}><ClipboardCopy size={14}/> REINTENTAR COPIA</button><button type="button" className="pb-mini-button pb-muted" onClick={()=>setPromptDialog(null)}>CERRAR</button></div></section></div>}
      </>}
    </section>
  </div>;
};
