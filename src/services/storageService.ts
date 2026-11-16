import { FighterProfile } from '../types/fighter';

const API_KEY_STORAGE = 'photo_brawl_gemini_api_key';
const DB_NAME = 'PhotoBrawl16BitDB';
const DB_VERSION = 2;
const STORE_FIGHTERS = 'custom_fighters';

export function getGeminiApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setGeminiApiKey(key: string): void {
  try {
    localStorage.setItem(API_KEY_STORAGE, key.trim());
  } catch (e) {
    console.error('Error saving API key to localStorage', e);
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_FIGHTERS)) {
        db.createObjectStore(STORE_FIGHTERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('creator_drafts')) {
        db.createObjectStore('creator_drafts', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () => reject(new Error('Cierra otras pestañas del juego para actualizar el almacenamiento.'));
    request.onerror = () => reject(request.error);
  });
}

export async function saveCustomFighter(fighter: FighterProfile): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FIGHTERS, 'readwrite');
    const store = tx.objectStore(STORE_FIGHTERS);
    store.put(fighter);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getAllCustomFighters(): Promise<FighterProfile[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FIGHTERS, 'readonly');
      const store = tx.objectStore(STORE_FIGHTERS);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result as FighterProfile[]) || [];
        list.sort((a, b) => b.createdAt - a.createdAt);
        resolve(list);
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  } catch (err) {
    console.warn('IndexedDB unavailable, returning empty custom fighters list', err);
    return [];
  }
}

export async function deleteCustomFighter(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FIGHTERS, 'readwrite');
    const store = tx.objectStore(STORE_FIGHTERS);
    store.delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
