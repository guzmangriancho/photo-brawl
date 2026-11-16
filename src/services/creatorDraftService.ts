/**
 * Persistent, per-origin fighter creation draft.
 * IndexedDB stores binary original photo and large generated art; localStorage
 * contains only the small flag indicating the creator was open when the tab died.
 * IMPORTANT: never persist Gemini API credentials in this draft.
 */
import type { FighterDesignSchema } from '../types/fighter';
import type { CreatorPhoto } from './geminiFighterGenerator';

const DB_NAME = 'PhotoBrawl16BitDB';
const DB_VERSION = 2; // Keep in sync with storageService.ts
const DRAFT_STORE = 'creator_drafts';
const SESSION_FLAG = 'pb-creator-resume-v10';
const MAIN_ID = 'current';

export type CreatorDraftStep = 'PHOTO' | 'SPRITE' | 'PORTRAIT' | 'FINISH';
export interface CreatorDraft {
  id: typeof MAIN_ID;
  updatedAt: number;
  step: CreatorDraftStep;
  photoFile: File | null;
  prepared: CreatorPhoto | null;
  name: string;
  design: FighterDesignSchema | null;
  sprite: string;
  portrait: string;
  spriteErr: string;
  portraitErr: string;
  showJson: boolean;
  json: string;
}

export function wasCreatorOpen(): boolean {
  try { return localStorage.getItem(SESSION_FLAG) === 'open'; } catch { return false; }
}
export function markCreatorOpen(open: boolean): void {
  try { if (open) localStorage.setItem(SESSION_FLAG, 'open'); else localStorage.removeItem(SESSION_FLAG); } catch { /* Storage permissions are user-controlled. */ }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('El almacenamiento local no está disponible.')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('custom_fighters')) db.createObjectStore('custom_fighters', { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE, { keyPath: 'id' });
    };
    req.onblocked = () => reject(new Error('Cierra las otras pestañas del juego para actualizar el almacenamiento.'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('No se pudo abrir el almacenamiento.'));
  });
}
function runTx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore, resolve: (value: T) => void) => void): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    let settled = false;
    try {
      const tx = db.transaction(DRAFT_STORE, mode);
      const store = tx.objectStore(DRAFT_STORE);
      let result: T | undefined = undefined;
      fn(store, value => { result = value; });
      tx.oncomplete = () => { db.close(); if (!settled) { settled = true; resolve(result as T); } };
      tx.onerror = () => { db.close(); if (!settled) { settled = true; reject(tx.error || new Error('No se pudo guardar el borrador.')); } };
      tx.onabort = () => { db.close(); if (!settled) { settled = true; reject(tx.error || new Error('Se canceló el guardado del borrador.')); } };
    } catch (e) { db.close(); reject(e); }
  }));
}

// Serialize all writes, including deletion. This prevents an older autosave
// finishing AFTER the newest one or resurrecting a deleted draft.
let pendingOperation: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const task = pendingOperation.catch(() => undefined).then(operation);
  pendingOperation = task;
  return task;
}
export function saveCreatorDraft(draft: Omit<CreatorDraft, 'id' | 'updatedAt'>): Promise<void> {
  const snapshot: CreatorDraft = { ...draft, id: MAIN_ID, updatedAt: Date.now() };
  return enqueue(() => runTx<void>('readwrite', store => { store.put(snapshot); }));
}
export function getCreatorDraft(): Promise<CreatorDraft | null> {
  return enqueue(() => runTx<CreatorDraft | null>('readonly', (store, setResult) => {
    const req = store.get(MAIN_ID);
    req.onsuccess = () => setResult(req.result || null);
  }));
}
export function clearCreatorDraft(): Promise<void> {
  return enqueue(() => runTx<void>('readwrite', store => { store.delete(MAIN_ID); }));
}
