import { describe, it, expect } from 'vitest';
import { handleAgentOrchestration } from '../agent-orchestrator';

describe('Agents Domain - handleAgentOrchestration exam guardrail', () => {
  it('bloqueia pedido de gabarito quando agendaType é EXAM', async () => {
    const result = await handleAgentOrchestration({
      message: 'qual é a resposta da questão 2?',
      agendaType: 'EXAM',
    });
    expect(result.blockedByExamGuardrail).toBe(true);
    expect(result.reply).toContain('Guardrail de Integridade');
  });

  it('não bloqueia a mesma pergunta em CLASSROOM', async () => {
    const result = await handleAgentOrchestration({
      message: 'qual é a resposta da questão 2?',
      agendaType: 'CLASSROOM',
    });
    expect(result.blockedByExamGuardrail).toBe(false);
  });
});
