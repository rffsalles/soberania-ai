import { createHash } from 'node:crypto';
import type { TimeScriptItem } from '@/domains/teaching/time-script';


/** Identidade do conteúdo do passo: muda quando o que a tutora leria muda; ignora tempo e ordem dos capítulos. */
export function stepHash(item: TimeScriptItem, chapterIds: string[]): string {
  const data = JSON.stringify([item.activity, item.description, item.socraticQuestion ?? '', [...chapterIds].sort()]);
  return createHash('sha256').update(data).digest('hex');
}
