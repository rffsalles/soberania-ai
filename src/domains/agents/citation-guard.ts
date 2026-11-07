import { isSyntheticChapter } from '@/domains/rag/constants';
import type { DidacticChunk } from '@/domains/rag/types';

// Módulo puro (sem banco): pode ser importado por componentes de cliente.

/** O que a verificação precisa de cada trecho entregue ao modelo. */
export type CitationSource = Pick<DidacticChunk, 'chapter' | 'pageNumber'>;

export type ReferenceCheck = {
  text: string;
  /** Referências removidas ou trocadas (trecho original), na ordem em que apareceram. */
  removed: string[];
};

type Ref = { kind?: 'capitulo' | 'artigo'; number?: string; page?: number };

const NOT_WORD_BEFORE = '(?<![\\p{L}\\p{N}])';
const CHAP = '(cap[íi]tulo|cap\\.?|artigo|art\\.)\\s*(\\d+(?:\\.\\d+)*)\\s*º?';
const PAGE = '(?:p[áa]ginas?|p[áa]gs?\\.?|pp?\\.)\\s*(\\d+)(?:\\s*[-–]\\s*\\d+)?';
const REF = `${NOT_WORD_BEFORE}(?:${CHAP}(?:\\s*,?\\s*(?:(?:na|à|a)\\s+)?${PAGE})?|${PAGE})(?![\\p{L}\\p{N}])`;

// Preposição/artigo antes da referência decide a troca ("no Capítulo 3" -> "no material").
const PREP = '(no|na|nos|nas|em|do|da|dos|das|o|a|os|as|ao|à|pelo|pela)';
// Complemento que só faz sentido com a referência ("... do material adotado pelo professor").
const TAIL =
  '(?:\\s+(?:do|da|no|na)\\s+(?:material|livro|texto|apostila)(?:\\s+(?:didático|oficial|adotado|base))*(?:\\s+pelo\\s+professor(?:\\s+responsável)?)?)?';

const PREP_REPLACEMENT: Record<string, string> = {
  no: 'no', na: 'no', nos: 'no', nas: 'no', em: 'no',
  do: 'do', da: 'do', dos: 'do', das: 'do',
  o: 'o', a: 'o', os: 'o', as: 'o',
  ao: 'ao', à: 'ao',
  pelo: 'pelo', pela: 'pelo',
};

const refPattern = () => new RegExp(REF, 'giu');
const INLINE = new RegExp(`(?:${NOT_WORD_BEFORE}${PREP}\\s+)?(${REF})(${TAIL})`, 'giu');
const BRACKETED = /\s*\[([^[\]\n]{0,200})\]/gu;
const PARENTHESIZED = /\s*\(([^()\n]{0,160})\)/gu;
const CITATION_HINT = /cap[íi]tulo|cap\.|p[áa]g|artigo/iu;

function chapterKind(word: string): 'capitulo' | 'artigo' {
  return word.toLowerCase().startsWith('art') ? 'artigo' : 'capitulo';
}

function normalizeNumber(n: string): string {
  return n.split('.').map((part) => String(Number(part))).join('.');
}

function parseRef(match: RegExpExecArray | RegExpMatchArray, offset = 0): Ref {
  const [kindWord, number, chapPage, page] = [match[offset + 1], match[offset + 2], match[offset + 3], match[offset + 4]];
  const ref: Ref = {};
  if (kindWord && number) {
    ref.kind = chapterKind(kindWord);
    ref.number = normalizeNumber(number);
  }
  const p = chapPage ?? page;
  if (p) ref.page = Number(p);
  return ref;
}

function parseSource(source: CitationSource): Ref {
  const label = source.chapter.split(':')[0].trim();
  const ref: Ref = {};
  const m = new RegExp(`^${CHAP}`, 'iu').exec(label);
  if (m) {
    ref.kind = chapterKind(m[1]);
    ref.number = normalizeNumber(m[2]);
  }
  // Trechos sintéticos (DOCX/TXT/MD) não têm página real: nenhuma página deles pode ser citada.
  if (!isSyntheticChapter(label)) ref.page = source.pageNumber;
  return ref;
}

function isSupported(ref: Ref, sources: Ref[]): boolean {
  return sources.some(
    (s) =>
      (ref.number === undefined || (s.kind === ref.kind && s.number === ref.number)) &&
      (ref.page === undefined || s.page === ref.page)
  );
}

function refsIn(text: string): { raw: string; ref: Ref }[] {
  return Array.from(text.matchAll(refPattern()), (m) => ({ raw: m[0], ref: parseRef(m) }));
}

function isSentenceStart(text: string, index: number): boolean {
  const before = text.slice(0, index).trimEnd();
  return before.length === 0 || /[.!?:\n]$/.test(before);
}

function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/\b(no|do|o|ao|pelo) material(?: (?:no|do|o|ao|pelo) material)+/g, '$1 material');
}

/**
 * Verificação pós-geração das referências a capítulo/página/artigo escritas no texto da tutora.
 *
 * Só valem referências que batem com os trechos efetivamente entregues ao modelo (`sources`): capítulo
 * (ou artigo) pelo número do rótulo e página pelo `pageNumber` do mesmo trecho. As demais são inventadas:
 * citações entre colchetes e parênteses só com referências inventadas somem; no meio da frase, a
 * referência vira uma indicação neutra ("no material"). Texto sem referência numerada fica intacto.
 */
export function stripUnsupportedReferences(text: string, sources: CitationSource[]): ReferenceCheck {
  const allowed = sources.map(parseSource);
  const removed: string[] = [];

  const dropIfInvented = (whole: string, inner: string, requireHint: boolean) => {
    const refs = refsIn(inner);
    if (refs.length === 0 && !(requireHint && CITATION_HINT.test(inner))) return whole;
    // Alguma referência real dentro: mantém o bloco e deixa a passada inline trocar só as inventadas.
    if (refs.some((r) => isSupported(r.ref, allowed))) return whole;
    removed.push(refs.length > 0 ? refs.map((r) => r.raw).join('; ') : inner.trim());
    return '';
  };

  // O modelo às vezes copia o marcador interno do prompt: "[FONTE: [Livro · Cap. 4, pág. 58]]" -> "[Livro · ...]".
  let out = text.replace(/\[FONTE:\s*(\[[^[\]\n]*\])\]/gu, '$1').replace(/\[FONTE:\s*([^[\]\n]*)\]/gu, '[$1]');
  out = out.replace(BRACKETED, (whole, inner: string) => dropIfInvented(whole, inner, true));
  out = out.replace(PARENTHESIZED, (whole, inner: string) => dropIfInvented(whole, inner, false));

  out = out.replace(INLINE, (whole: string, prep: string | undefined, refText: string, ...rest: unknown[]) => {
    const offset = rest.find((v) => typeof v === 'number') as number;
    const m = refText.match(new RegExp(REF, 'iu'));
    if (!m || isSupported(parseRef(m), allowed)) return whole;
    removed.push(refText.trim());
    if (prep) {
      const replacement = `${PREP_REPLACEMENT[prep.toLowerCase()] ?? 'no'} material`;
      return prep[0] === prep[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
    }
    return isSentenceStart(out, offset) ? 'O material' : 'o material';
  });

  return { text: removed.length > 0 ? tidy(out) : out, removed };
}
