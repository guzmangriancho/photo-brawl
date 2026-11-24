import { useState } from 'react';
import { Camera, Coins, Loader2, Lock, X } from 'lucide-react';
import { buySlot, type Wallet } from '../services/economyService';
import './economy.css';

interface Props { wallet: Wallet; used: number; onClose: () => void; onBought: (wallet: Wallet) => void; onCreate: () => void }
/** Monedero y slots: una sola ventana pequeña, sin pantallas nuevas. */
export function SlotShop({ wallet, used, onClose, onBought, onCreate }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const price = wallet.next_price;
  const missing = price != null ? Math.max(0, price - wallet.coins) : 0;
  const free = wallet.slots - used;
  const buy = async () => {
    if (busy || price == null || missing > 0) return;
    setBusy(true); setError('');
    try { onBought(await buySlot()); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo comprar el slot.'); }
    finally { setBusy(false); }
  };
  return <div className="pb-modal-backdrop" role="presentation" onPointerDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <section className="pb-modal pb-frame pb-slot-shop" role="dialog" aria-modal="true" aria-label="Monedas y slots">
      <button type="button" className="pb-slot-close" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
      <div className="pb-slot-head"><span>TU MONEDERO</span><h2>COLECCIÓN {used}/{wallet.slots}</h2></div>
      <div className="pb-slot-pips" aria-hidden="true">
        {Array.from({ length: wallet.max_slots }, (_, i) => <i key={i} className={i < used ? 'used' : i < wallet.slots ? 'free' : 'locked'} />)}
      </div>
      <div className="pb-slot-balance"><Coins size={20} /><strong>{wallet.coins}</strong><small>MONEDAS</small></div>
      {price != null
        ? <button type="button" className="pb-arcade-button pb-gold pb-slot-buy" disabled={busy || missing > 0} onClick={buy}>
          {busy ? <Loader2 size={17} /> : missing > 0 ? <Lock size={17} /> : <Coins size={17} />} SLOT {wallet.slots + 1} · {price}
        </button>
        : <p className="pb-slot-note">TIENES TODOS LOS SLOTS</p>}
      {price != null && missing > 0 && <p className="pb-slot-note">TE FALTAN {missing} · GÁNALAS EN CLASIFICATORIAS</p>}
      {free > 0 && <button type="button" className="pb-mini-button pb-purple pb-slot-create" onClick={onCreate}><Camera size={15} /> CREAR LUCHADOR ({free} LIBRE{free > 1 ? 'S' : ''})</button>}
      <p className="pb-slot-rules">CLASIFICATORIA 1 VS 1: +25 VICTORIA · +10 DERROTA<br />GRUPOS: +30 · +20 · +12 · +8 · MÁX. {wallet.daily_cap} PARTIDAS AL DÍA<br />APUESTAS EN SALAS CLASIFICATORIAS 1 VS 1</p>
      {error && <p className="pb-slot-error" role="alert">{error}</p>}
    </section>
  </div>;
}
