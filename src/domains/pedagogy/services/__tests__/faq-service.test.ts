import { describe, it, expect, vi } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';
import { getAgendaFaqs, type FaqDeps } from '../faq-service';

const user = { id: 'stu1', role: Role.STUDENT, classId: 'c1' };

function makeDeps(getAgenda: FaqDeps['getAgenda']) {
  const listInteractions = vi.fn(async () => [
    { questionText: 'O que é left join null?', responseText: 'Resposta', guardrailBlocked: false },
    { questionText: 'Por que left join retorna null?', responseText: 'Outra', guardrailBlocked: false },
  ]);
  return { deps: { getAgenda, listInteractions } satisfies FaqDeps, listInteractions };
}

describe('getAgendaFaqs', () => {
  it('propaga 404 quando a agenda está fora do escopo e não lê interações', async () => {
    const { deps, listInteractions } = makeDeps(async () => {
      throw new DomainError(404, 'Agenda não encontrada.');
    });
    await expect(getAgendaFaqs(user, 'ag1', 5, deps)).rejects.toMatchObject({ status: 404 });
    expect(listInteractions).not.toHaveBeenCalled();
  });

  it('agrupa as interações da agenda em FAQs', async () => {
    const { deps } = makeDeps(async () => ({ id: 'ag1' }) as AgendaDTO);
    const faqs = await getAgendaFaqs(user, 'ag1', 5, deps);
    expect(faqs).toHaveLength(1);
    expect(faqs[0].frequency).toBe(2);
  });
});
