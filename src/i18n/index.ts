import { EN } from './en';
import { EN_RULES } from './enRules';

export type Lang = 'es' | 'en';
const KEY = 'photobrawl.lang';

export function getLang(): Lang {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'es'; } catch { return 'es'; }
}

const listeners = new Set<() => void>();
export function subscribeLang(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** Saves the choice and applies it live (no reload, so an open room, match or draft is never lost). */
export function setLang(lang: Lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* storage blocked: the choice cannot persist */ }
  applyLang();
  listeners.forEach(fn => fn());
}

/** Names typed or generated for fighters (and their moves) must never be translated. */
const protectedNames = new Set<string>();
export function protectNames(names: Iterable<string | undefined | null>) {
  for (const n of names) {
    const v = typeof n === 'string' ? n.trim().toLowerCase() : '';
    if (v) protectedNames.add(v);
  }
  cache.clear();
}

const lower = new Map<string, string>();
for (const k of Object.keys(EN)) lower.set(k.toLowerCase(), EN[k]);

function matchCase(src: string, out: string) {
  // Spanish UI labels are mostly UPPERCASE; keep that when the source is uppercase and has letters.
  return src === src.toUpperCase() && src !== src.toLowerCase() ? out.toUpperCase() : out;
}

function lookup(core: string): string | null {
  if (EN[core] !== undefined) return EN[core];
  const l = lower.get(core.toLowerCase());
  if (l !== undefined) return matchCase(core, l);
  for (const [re, fn] of EN_RULES) {
    const m = core.match(re);
    if (m) return fn(...(m.slice(1) as string[]));
  }
  return null;
}

const PREFIXES: [string, string][] = [['Probar ', 'Try '], ['Seleccionar ', 'Select '], ['Elegir ', 'Choose ']];
const cache = new Map<string, string>();

/** Translates a Spanish UI string to English. Unknown text (fighter names, user text) is returned unchanged. */
export function translate(text: string): string {
  if (!text || !/[A-Za-zÁÉÍÓÚáéíóúñÑ]{2}/.test(text)) return text;
  if (protectedNames.has(text.trim().toLowerCase())) return text;
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  const lead = text.match(/^\s*/)![0];
  const trail = text.match(/\s*$/)![0];
  const body = text.slice(lead.length, text.length - trail.length);
  let out: string | null = lookup(body);
  if (out === null) {
    // Retry without decorative punctuation around the label.
    const m = body.match(/^([\s·•:.!¡¿?\-–|→⇄★✓×+(\[]*)([\s\S]*?)([\s·•:.!?…\-–|→)\]]*)$/);
    if (m && m[2] && (m[1] || m[3])) {
      const inner = lookup(m[2]);
      if (inner !== null) out = m[1] + inner + m[3];
    }
  }
  if (out === null && body.includes(' · ')) {
    const parts = body.split(' · ').map(x => translate(x));
    if (parts.some((x, i) => x !== body.split(' · ')[i])) out = parts.join(' · ');
  }
  if (out === null) {
    for (const [es, en] of PREFIXES) {
      if (body.startsWith(es) && body.length > es.length) {
        const rest = translate(body.slice(es.length));
        if (rest !== body.slice(es.length)) { out = en + rest; break; }
      }
    }
  }
  if (out === null && /[.!?] \S/.test(body)) {
    const sentences = body.split(/(?<=[.!?]) (?=\S)/);
    const tr = sentences.map(x => translate(x));
    if (tr.some((x, i) => x !== sentences[i])) out = tr.join(' ');
  }
  if (out === null) out = body;
  else out = out.replace(/[¡¿]/g, '');
  const res = lead + out + trail;
  if (cache.size > 5000) cache.clear();
  cache.set(text, res);
  return res;
}

export function t(text: string): string {
  return getLang() === 'en' ? translate(text) : text;
}

const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
const textOrig = new WeakMap<Node, string>();
const attrOrig = new WeakMap<Element, Record<string, string>>();

function doText(node: Text) {
  const cur = node.data;
  const prev = textOrig.get(node);
  if (prev !== undefined && translate(prev) === cur) return;
  const next = translate(cur);
  if (next !== cur) { textOrig.set(node, cur); node.data = next; }
}

function doAttrs(el: Element) {
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (cur == null) continue;
    const rec = attrOrig.get(el)?.[a];
    if (rec !== undefined && translate(rec) === cur) continue;
    const next = translate(cur);
    if (next !== cur) {
      const r = attrOrig.get(el) ?? {};
      r[a] = cur; attrOrig.set(el, r);
      el.setAttribute(a, next);
    }
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { doText(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEXTAREA') return;
  doAttrs(el);
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null = tw.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) {
      const p = (n as Text).parentElement;
      if (!p || (p.tagName !== 'SCRIPT' && p.tagName !== 'STYLE' && p.tagName !== 'TEXTAREA')) doText(n as Text);
    } else doAttrs(n as Element);
    n = tw.nextNode();
  }
}

function restore(root: Node) {
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null = tw.currentNode;
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) {
      const orig = textOrig.get(n);
      if (orig !== undefined && translate(orig) === (n as Text).data) (n as Text).data = orig;
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const rec = attrOrig.get(n as Element);
      if (rec) for (const a of Object.keys(rec)) {
        if (translate(rec[a]) === (n as Element).getAttribute(a)) (n as Element).setAttribute(a, rec[a]);
      }
    }
    n = tw.nextNode();
  }
}

let observer: MutationObserver | null = null;
function applyLang() {
  const en = getLang() === 'en';
  document.documentElement.lang = en ? 'en' : 'es';
  if (!document.body) return;
  if (en && !observer) {
    walk(document.body);
    observer = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'characterData') doText(m.target as Text);
        else if (m.type === 'attributes') doAttrs(m.target as Element);
        else m.addedNodes.forEach(walk);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  } else if (!en && observer) {
    observer.disconnect(); observer = null;
    restore(document.body);
  }
  document.title = en ? translate(ES_TITLE) : ES_TITLE;
}

const ES_TITLE = typeof document !== 'undefined' ? document.title : '';

/** Call once at startup. Spanish stays untouched until English is chosen. */
export function installI18n() {
  // Native dialogs: translated only while English is selected.
  const w = window as any;
  const alert0 = w.alert.bind(w), confirm0 = w.confirm.bind(w), prompt0 = w.prompt.bind(w);
  w.alert = (m?: any) => alert0(t(String(m ?? '')));
  w.confirm = (m?: any) => confirm0(t(String(m ?? '')));
  w.prompt = (m?: any, d?: any) => prompt0(t(String(m ?? '')), d);

  // Canvas banners and floating combat text are drawn with fillText/strokeText.
  const proto = CanvasRenderingContext2D.prototype as any;
  for (const fn of ['fillText', 'strokeText']) {
    const orig = proto[fn];
    proto[fn] = function (this: CanvasRenderingContext2D, text: string, ...rest: any[]) {
      return orig.call(this, typeof text === 'string' ? t(text) : text, ...rest);
    };
  }

  if (document.body) applyLang(); else document.addEventListener('DOMContentLoaded', applyLang);
}
