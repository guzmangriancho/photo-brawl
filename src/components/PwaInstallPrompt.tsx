import React, { useEffect, useState } from 'react';
import { Check, Download, Gamepad2, Share2, Smartphone, X } from 'lucide-react';
import './pwaInstall.css';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{outcome:'accepted'|'dismissed'; platform:string}>;
}
const DISMISSED_KEY = 'pb-pwa-install-dismissed-v10';
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;
function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & {standalone?:boolean}).standalone);
}
function isIOS(): boolean {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function dismissedRecently(): boolean {
  try { return Date.now() - Number(localStorage.getItem(DISMISSED_KEY) || '0') < DISMISS_FOR_MS; }
  catch { return false; }
}

/** A small non-modal prompt. It never hijacks the user inside a fight or creator. */
export function PwaInstallPrompt({visible,requestId}:{visible:boolean;requestId:number}) {
  const [open,setOpen] = useState(false);
  const [installEvent,setInstallEvent] = useState<InstallEvent|null>(null);
  const [installed,setInstalled] = useState(isStandalone);
  const ios = isIOS();
  const iosOtherBrowser = ios && !(/Safari/i.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/i.test(navigator.userAgent));
  const [notSupported,setNotSupported] = useState(false);

  useEffect(() => {
    const before = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
      if (!dismissedRecently() && !isStandalone()) setOpen(true);
    };
    const after = () => { setInstalled(true); setOpen(false); setInstallEvent(null); };
    window.addEventListener('beforeinstallprompt',before);
    window.addEventListener('appinstalled',after);
    // On iOS the user must install from the browser's Share menu; there is no native install prompt.
    const timer = window.setTimeout(() => {
      if (ios && window.isSecureContext && !isStandalone() && !dismissedRecently()) setOpen(true);
    }, 2600);
    return () => {
      window.removeEventListener('beforeinstallprompt',before);
      window.removeEventListener('appinstalled',after);
      window.clearTimeout(timer);
    };
  }, [ios]);

  useEffect(() => { if (requestId > 0 && !installed) { setOpen(true); setNotSupported(false); } },[requestId,installed]);
  function dismiss() {
    try { localStorage.setItem(DISMISSED_KEY,String(Date.now())); } catch {}
    setOpen(false);
  }
  async function install() {
    if (!installEvent) { setNotSupported(true); return; }
    const event = installEvent;
    setInstallEvent(null);
    try {
      await event.prompt(); // only called from direct user interaction
      const result = await event.userChoice;
      if (result.outcome === 'accepted') setOpen(false);
      else dismiss();
    } catch { setNotSupported(true); }
  }
  if (!visible || !open || installed) return null;
  return <aside className="pb-install-banner" aria-label="Instalar PHOTO BRAWL">
    <button type="button" className="pb-install-close" aria-label="Ahora no" onClick={dismiss}><X size={16}/></button>
    <img src="/icons/icon-192.png" alt="" className="pb-install-icon"/>
    <div className="pb-install-content"><strong>PHOTO BRAWL EN TU MÓVIL</strong>
      {ios ? <p>{iosOtherBrowser ? 'Abre este sitio en Safari. Después toca Compartir y «Añadir a pantalla de inicio».' : <>Toca <Share2 size={12} aria-label="Compartir"/> <b>Compartir</b> y elige «Añadir a pantalla de inicio».</>}</p>
      : installEvent ? <p>Juega a pantalla completa, sin barra del navegador. Tus borradores seguirán guardados en este dispositivo.</p>
      : <p>{!window.isSecureContext ? 'Para instalar, abre el juego mediante HTTPS (en la IP local HTTP no aparece el instalador).' : 'En el menú de Chrome elige «Instalar aplicación» o «Añadir a pantalla de inicio».'}</p>}
      <div className="pb-install-actions">{installEvent ? <button type="button" className="pb-install-cta" onClick={()=>void install()}><Download size={14}/> INSTALAR</button>
        : <span className="pb-install-help"><Smartphone size={13}/>{ios ? 'INSTALACIÓN MANUAL EN iOS' : 'INSTALAR DESDE EL NAVEGADOR'}</span>}
        <button type="button" className="pb-install-later" onClick={dismiss}><Check size={13}/> ENTENDIDO</button>
      </div>
      {notSupported && <small>Usa el menú de instalación de tu navegador.</small>}
    </div>
    <Gamepad2 size={16} className="pb-install-decor"/>
  </aside>;
}
