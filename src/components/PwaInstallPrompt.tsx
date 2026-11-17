import React, { useEffect, useState } from 'react';
import { Check, Download, Gamepad2, Share2, Smartphone, X } from 'lucide-react';
import './pwaInstall.css';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{outcome:'accepted'|'dismissed'; platform:string}>;
}
// One-time reset after the install-banner fix: previous versions could hide it
// for 14 days even though the native install event was never available.
const DISMISSED_KEY = 'pb-pwa-install-dismissed-v19-4';
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

// Subscribe as soon as the module loads, before React mounts the main menu.
// Chromium may dispatch beforeinstallprompt while the roster is still loading.
let pendingInstallEvent: InstallEvent | null = null;
const installListeners = new Set<(event: InstallEvent | null) => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event: Event) => {
    event.preventDefault();
    pendingInstallEvent = event as InstallEvent;
    installListeners.forEach(listener => listener(pendingInstallEvent));
  });
  window.addEventListener('appinstalled', () => {
    pendingInstallEvent = null;
    installListeners.forEach(listener => listener(null));
  });
}
function isMobileLike(): boolean {
  return isIOS() || /Android|Mobile/i.test(navigator.userAgent) ||
    window.matchMedia('(pointer: coarse)').matches;
}
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
  const [installEvent,setInstallEvent] = useState<InstallEvent|null>(() => pendingInstallEvent);
  const [installed,setInstalled] = useState(isStandalone);
  const ios = isIOS();
  const iosOtherBrowser = ios && !(/Safari/i.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/i.test(navigator.userAgent));
  const [notSupported,setNotSupported] = useState(false);

  useEffect(() => {
    const receive = (event: InstallEvent | null) => {
      setInstallEvent(event);
      if (event && !dismissedRecently() && !isStandalone()) setOpen(true);
      if (!event && isStandalone()) { setInstalled(true); setOpen(false); }
    };
    installListeners.add(receive);
    // Show an informational in-game banner even if the browser does not offer
    // beforeinstallprompt (Safari, some Android browsers, or installability delayed).
    // The native prompt is only invoked if an event actually exists.
    const timer = window.setTimeout(() => {
      if (window.isSecureContext && isMobileLike() && !isStandalone() && !dismissedRecently()) {
        setOpen(true);
      }
    }, 2500);
    if (pendingInstallEvent) receive(pendingInstallEvent);
    return () => {
      installListeners.delete(receive);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => { if (requestId > 0 && !installed) { setOpen(true); setNotSupported(false); } },[requestId,installed]);
  function dismiss() {
    try { localStorage.setItem(DISMISSED_KEY,String(Date.now())); } catch {}
    setOpen(false);
  }
  async function install() {
    if (!installEvent) { setNotSupported(true); return; }
    const event = installEvent;
    setInstallEvent(null);
    pendingInstallEvent = null;
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
