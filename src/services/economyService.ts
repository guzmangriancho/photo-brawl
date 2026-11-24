import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

/** Monedas virtuales y slots de luchador. Solo el servidor concede monedas; el cliente lee su
 * monedero y compra slots con una función atómica de Supabase. Si la migración V62 aún no está
 * aplicada, `fetchWallet` devuelve null y el juego se comporta como antes (sin límite ni monedas). */
export type Wallet = {
  coins: number; slots: number; used: number; next_price: number | null;
  max_slots: number; rewarded_today: number; daily_cap: number;
};
export const WALLET_EVENT = 'pb-wallet-changed';
export const WAGER_STEPS = [0, 10, 25, 50, 100] as const;

function parseWallet(value: unknown): Wallet | null {
  const w = value as Partial<Wallet> | null;
  if (!w || !Number.isFinite(w.coins) || !Number.isFinite(w.slots)) return null;
  return {
    coins: Number(w.coins), slots: Number(w.slots), used: Number(w.used ?? 0),
    next_price: w.next_price == null ? null : Number(w.next_price),
    max_slots: Number(w.max_slots ?? 12), rewarded_today: Number(w.rewarded_today ?? 0), daily_cap: Number(w.daily_cap ?? 10),
  };
}
export async function fetchWallet(): Promise<Wallet | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('economy_wallet');
  if (error) { console.warn('Monedero no disponible', error.message); return null; }
  return parseWallet(data);
}
export async function buySlot(): Promise<Wallet> {
  if (!supabase) throw new Error('Inicia sesión para comprar un slot.');
  const { data, error } = await supabase.rpc('economy_buy_slot');
  if (error) throw new Error(error.message || 'No se pudo comprar el slot.');
  const wallet = parseWallet(data);
  if (!wallet) throw new Error('Respuesta de monedero no válida.');
  notifyWalletChanged();
  return wallet;
}
export function notifyWalletChanged() { window.dispatchEvent(new Event(WALLET_EVENT)); }
/** Mensaje claro cuando el límite de slots rechaza un luchador al sincronizar o recibirlo. */
export function isSlotLimitError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  return /hueco libre|SLOTS_FULL/i.test(text);
}

export function useWallet(userId?: string) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const refresh = useCallback(async () => {
    if (!userId) { setWallet(null); return null; }
    const next = await fetchWallet();
    setWallet(next);
    return next;
  }, [userId]);
  useEffect(() => {
    if (!userId) { setWallet(null); return; }
    let alive = true;
    const load = () => { void fetchWallet().then(next => { if (alive) setWallet(next); }); };
    load();
    window.addEventListener(WALLET_EVENT, load);
    window.addEventListener('focus', load);
    return () => { alive = false; window.removeEventListener(WALLET_EVENT, load); window.removeEventListener('focus', load); };
  }, [userId]);
  return { wallet, refresh };
}
