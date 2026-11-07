import { describe, expect, it } from 'vitest';
import { buildNoMaterialReply, hasSubjectTerms, shouldRefuseWithoutMaterial } from '../no-material';

describe('shouldRefuseWithoutMaterial', () => {
  it('recusa sem chamar o modelo só em sala de aula e plantão, sem trechos e sem conversa em andamento', () => {
    expect(shouldRefuseWithoutMaterial({ agendaType: 'CLASSROOM', chunkCount: 0, historyLength: 0, message: 'Explique recursão em árvores' })).toBe(true);
    expect(shouldRefuseWithoutMaterial({ agendaType: 'OFFICE_HOURS', chunkCount: 0, historyLength: 0, message: 'Explique recursão em árvores' })).toBe(true);
  });

  it('com trecho recuperado segue para o modelo', () => {
    expect(shouldRefuseWithoutMaterial({ agendaType: 'CLASSROOM', chunkCount: 1, historyLength: 0, message: 'Explique recursão em árvores' })).toBe(false);
  });

  it('com conversa em andamento (resposta do aluno a uma pergunta da tutora) segue para o modelo', () => {
    expect(shouldRefuseWithoutMaterial({ agendaType: 'CLASSROOM', chunkCount: 0, historyLength: 2, message: 'acho que é a recursão' })).toBe(false);
  });

  it('mensagem sem termo de assunto (cumprimento, identidade) segue para o modelo', () => {
    for (const message of ['Quem é você?', 'Oi Lucy, tudo bem?', 'Bom dia!', 'Pode me ajudar?']) {
      expect(shouldRefuseWithoutMaterial({ agendaType: 'OFFICE_HOURS', chunkCount: 0, historyLength: 0, message })).toBe(false);
    }
  });

  it('grupo de estudos, revisão de texto e prova nunca recusam por falta de trecho', () => {
    for (const agendaType of ['STUDY_GROUP', 'DRAFT_REVIEW', 'EXAM'] as const) {
      expect(shouldRefuseWithoutMaterial({ agendaType, chunkCount: 0, historyLength: 0, message: 'Explique recursão em árvores' })).toBe(false);
    }
  });
});

describe('hasSubjectTerms', () => {
  it('reconhece termos de assunto, inclusive siglas curtas', () => {
    expect(hasSubjectTerms('Qual é a capital do país?')).toBe(true);
    expect(hasSubjectTerms('O que é SQL?')).toBe(true);
    expect(hasSubjectTerms('Me explica a 2FN')).toBe(true);
  });

  it('ignora palavras funcionais, pedidos genéricos e o nome da tutora', () => {
    expect(hasSubjectTerms('Quem é você?')).toBe(false);
    expect(hasSubjectTerms('Oi @lucy, tudo bem? Pode me explicar uma coisa?')).toBe(false);
    expect(hasSubjectTerms('Obrigado!')).toBe(false);
  });
});

describe('buildNoMaterialReply', () => {
  it('em sala com capítulos da aula, recusa e sugere esses capítulos com uma pergunta de volta', () => {
    const reply = buildNoMaterialReply('CLASSROOM', {
      chapterLabels: ['Cap. 4: Álgebra Relacional (Banco de Dados)', 'Cap. 6: Normalização (Banco de Dados)'],
    });
    expect(reply).toMatch(/^Não encontrei isso no material desta aula\./);
    expect(reply).toContain('Cap. 4: Álgebra Relacional (Banco de Dados); Cap. 6: Normalização (Banco de Dados)');
    expect(reply.trim().endsWith('?')).toBe(true);
  });

  it('em sala sem capítulos definidos, recusa e orienta a perguntar sobre o material', () => {
    const reply = buildNoMaterialReply('CLASSROOM', undefined);
    expect(reply).toMatch(/^Não encontrei isso no material desta aula\./);
    expect(reply).not.toContain('Cap.');
  });

  it('no plantão fala do material da disciplina', () => {
    const reply = buildNoMaterialReply('OFFICE_HOURS', undefined);
    expect(reply).toMatch(/^Não encontrei isso no material da disciplina\./);
  });

  it('é texto simples e curto', () => {
    for (const reply of [buildNoMaterialReply('CLASSROOM', undefined), buildNoMaterialReply('OFFICE_HOURS', undefined)]) {
      expect(reply).not.toMatch(/\*\*|^\s*[-*•]\s|#/m);
      expect(reply.length).toBeLessThan(400);
    }
  });
});
