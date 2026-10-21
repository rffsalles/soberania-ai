export interface FAQItem {
  id: string;
  timestampSeconds: number;
  question: string;
  shortAnswer: string;
  sourceChapter: string;
  frequency: number;
}

export interface FaqInteraction {
  questionText: string;
  responseText: string;
  guardrailBlocked: boolean;
  ragSourceBook?: string | null;
  ragSourcePage?: number | null;
  timestampInVideo?: number | null;
}

export const FAQ_DEFAULT_LIMIT = 5;
export const FAQ_MAX_LIMIT = 20;
const FAQ_MIN_TERM_LENGTH = 4;
const FAQ_SIMILARITY_THRESHOLD = 0.5;
const FAQ_ANSWER_MAX_CHARS = 240;
const COMBINING_MARKS = /[̀-ͯ]/g;
const NON_ALPHANUMERIC = /[^a-z0-9\s]/g;
const WHITESPACE = /\s+/;

function terms(question: string): Set<string> {
  const normalized = question.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '').replace(NON_ALPHANUMERIC, ' ');
  return new Set(normalized.split(WHITESPACE).filter((t) => t.length >= FAQ_MIN_TERM_LENGTH));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function sourceOf(i: FaqInteraction): string {
  if (!i.ragSourceBook) return '';
  return i.ragSourcePage ? `${i.ragSourceBook}, pág. ${i.ragSourcePage}` : i.ragSourceBook;
}

/** Agrupa perguntas semelhantes (Jaccard de termos) e devolve as mais frequentes. */
export function buildFaqs(interactions: FaqInteraction[], limit = FAQ_DEFAULT_LIMIT): FAQItem[] {
  const groups: { terms: Set<string>; members: FaqInteraction[] }[] = [];
  for (const interaction of interactions) {
    if (interaction.guardrailBlocked) continue;
    const t = terms(interaction.questionText);
    const group = groups.find((g) => jaccard(g.terms, t) >= FAQ_SIMILARITY_THRESHOLD);
    if (group) group.members.push(interaction);
    else groups.push({ terms: t, members: [interaction] });
  }

  const items = groups.map((g) => {
    const rep = g.members.reduce((s, m) => (m.questionText.length < s.questionText.length ? m : s));
    const stamps = g.members.map((m) => m.timestampInVideo).filter((s): s is number => typeof s === 'number');
    return {
      question: rep.questionText,
      shortAnswer: rep.responseText.slice(0, FAQ_ANSWER_MAX_CHARS),
      sourceChapter: sourceOf(rep),
      timestampSeconds: stamps.length ? Math.min(...stamps) : 0,
      frequency: g.members.length,
    };
  });

  items.sort((a, b) => b.frequency - a.frequency || a.timestampSeconds - b.timestampSeconds);
  return items.slice(0, limit).map((item, index) => ({ id: `faq-${index}`, ...item }));
}
