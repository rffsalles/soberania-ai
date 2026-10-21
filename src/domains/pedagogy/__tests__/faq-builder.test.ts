import { describe, it, expect } from 'vitest';
import { buildFaqs, type FaqInteraction } from '../faq-builder';

function q(questionText: string, o: Partial<FaqInteraction> = {}): FaqInteraction {
  return { questionText, responseText: `Resposta para ${questionText}`, guardrailBlocked: false, ...o };
}

describe('buildFaqs', () => {
  const base = [
    q('O que é left join null?', { timestampInVideo: 300, ragSourceBook: 'BD', ragSourcePage: 62 }),
    q('Por que o left join retorna null?', { timestampInVideo: 120 }),
    q('Left join null quando acontece?'),
    q('Como aplicar a 3fn?', { timestampInVideo: 50 }),
  ];

  it('agrupa perguntas parecidas e ordena por frequência', () => {
    const faqs = buildFaqs(base);
    expect(faqs).toHaveLength(2);
    expect(faqs[0].frequency).toBe(3);
    expect(faqs[0].timestampSeconds).toBe(120);
    expect(faqs[1].frequency).toBe(1);
    expect(faqs[0].id).toBe('faq-0');
  });

  it('usa a menor pergunta e a fonte do representante', () => {
    const [first] = buildFaqs(base);
    expect(first.question).toBe('O que é left join null?');
    expect(first.sourceChapter).toBe('BD, pág. 62');
    expect(buildFaqs([base[2]])[0].sourceChapter).toBe('');
  });

  it('respeita o limite', () => {
    expect(buildFaqs(base, 1)).toHaveLength(1);
  });

  it('ignora interações bloqueadas por guardrail', () => {
    const faqs = buildFaqs([...base, q('Pergunta bloqueada sobre prova', { guardrailBlocked: true })]);
    expect(faqs).toHaveLength(2);
  });

  it('trunca a resposta em 240 caracteres', () => {
    const [faq] = buildFaqs([q('Explique normalização', { responseText: 'x'.repeat(500) })]);
    expect(faq.shortAnswer).toHaveLength(240);
  });
});
