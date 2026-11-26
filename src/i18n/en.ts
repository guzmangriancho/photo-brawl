import { LABELS } from './parts/labels';
import { SENTENCES } from './parts/sentences';

function parse(src: string, into: Record<string, string>) {
  for (const line of src.split('\n')) {
    const i = line.indexOf(' => ');
    if (i < 0) continue;
    const es = line.slice(0, i).trim();
    const en = line.slice(i + 4).trim();
    if (es && en) into[es] = en;
  }
}

export const EN: Record<string, string> = {};
parse(LABELS, EN);
parse(SENTENCES, EN);
