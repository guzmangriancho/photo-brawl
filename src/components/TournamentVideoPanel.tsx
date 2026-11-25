import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Film, Loader2 } from 'lucide-react';
import { fetchTournamentVideo, requestTournamentVideo, type TournamentVideoState } from '../services/tournamentService';

const POLL_MS = 20000;

/** Vídeo del torneo terminado: pedir, ver estado y descargar. Solo aparece para el propietario (el servidor decide). */
export function TournamentVideoPanel({ tournamentId }: { tournamentId: string }) {
  const [v, setV] = useState<TournamentVideoState | null>(null);
  const [day, setDay] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    try { const r = await fetchTournamentVideo(tournamentId); if (alive.current) { setV(r); if (r.dayNo) setDay(String(r.dayNo)); } }
    catch { /* sin permiso o sin conexión: el panel simplemente no aparece o se queda como está */ }
  }, [tournamentId]);
  useEffect(() => { setV(null); setError(''); void load(); }, [load]);
  useEffect(() => {
    if (v?.status !== 'queued') return undefined;
    const id = window.setInterval(() => { void load(); }, POLL_MS);
    return () => window.clearInterval(id);
  }, [v?.status, load]);

  if (!v?.enabled) return null;
  const dayNum = Number(day);
  const dayOk = Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 999;
  const ask = async (force: boolean) => {
    setBusy(true); setError('');
    try { const r = await requestTournamentVideo(tournamentId, dayNum, force); if (alive.current) setV(r); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'No se pudo pedir el vídeo.'); }
    finally { if (alive.current) setBusy(false); }
  };
  const status = v.status || 'none';
  return <section className="pb-frame pb-trn-card pb-trn-center" aria-label="Vídeo del torneo">
    <Film size={26} /><p>VÍDEO DEL TORNEO</p>
    {(status === 'none' || status === 'failed') && <>
      <small>{status === 'failed' ? 'La última generación falló. Puedes volver a pedirla.' : 'Vertical, con intro, combates, música y campeón. Tarda unos minutos.'}</small>
      <label className="pb-trn-day">TORNEO · DÍA <input type="number" min={1} max={999} inputMode="numeric" value={day} onChange={e => setDay(e.target.value)} aria-label="Número de día" /></label>
      <button type="button" className="pb-mini-button" disabled={busy || !dayOk} onClick={() => { void ask(status === 'failed'); }}>{busy ? 'PIDIENDO…' : 'GENERAR VÍDEO'}</button>
    </>}
    {status === 'queued' && <small role="status"><Loader2 className="pb-trn-spin" size={14} /> GENERANDO… TORNEO · DÍA {v.dayNo}. Puedes salir de esta pantalla.</small>}
    {status === 'ready' && <>
      <small>TORNEO · DÍA {v.dayNo}. El enlace caduca en 5 minutos; vuelve a abrir esta pantalla para otro.</small>
      {v.url && <a className="pb-mini-button" href={v.url} download target="_blank" rel="noopener noreferrer"><Download size={14} /> DESCARGAR VÍDEO</a>}
      <button type="button" className="pb-mini-button" disabled={busy || !dayOk} onClick={() => { void ask(true); }}>REGENERAR</button>
    </>}
    {error && <div className="pb-trn-error" role="alert">{error}</div>}
  </section>;
}
