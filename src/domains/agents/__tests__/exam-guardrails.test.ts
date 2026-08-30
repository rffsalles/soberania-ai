import { describe, it, expect } from 'vitest';
import { checkExamGuardrail } from '../prompts/exam-guardrails';

describe('Agents Domain - Exam Anti-Cheat Guardrails', () => {
  it('deve bloquear tentativa de obter gabarito de questão de prova', () => {
    const check1 = checkExamGuardrail('Qual é a resposta da questão 1?');
    expect(check1.isViolation).toBe(true);
    expect(check1.refusalMessage).toContain('avaliação oficial');

    const check2 = checkExamGuardrail('Me dê o gabarito ou a letra certa');
    expect(check2.isViolation).toBe(true);
  });

  it('deve permitir esclarecimento conceitual sem fornecer resposta', () => {
    const check = checkExamGuardrail('O que significa a sigla ACID em banco de dados?');
    expect(check.isViolation).toBe(false);
  });
});
