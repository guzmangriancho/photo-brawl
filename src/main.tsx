import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Keep Vite hot reload responsive: SW is only registered in production builds.
// HTTP LAN addresses are NOT secure origins; use HTTPS to test installation on mobile.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', {scope:'/'}).then(async registration => {
      const worker = registration.active || registration.waiting || registration.installing;
      // Cache the hashed Vite JS/CSS of the current release for subsequent offline launches.
      const assets = [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src],link[rel="stylesheet"][href]')]
        .map(el => (el as HTMLScriptElement).src || (el as HTMLLinkElement).href)
        .filter(url => url && new URL(url).origin === location.origin);
      if (worker?.state === 'activated') worker.postMessage({type:'CACHE_APP_ASSETS', urls:assets});
      else navigator.serviceWorker.ready.then(ready => ready.active?.postMessage({type:'CACHE_APP_ASSETS',urls:assets}));
    }).catch(error => console.warn('La instalación PWA no está disponible en este navegador:',error));
  });
}
