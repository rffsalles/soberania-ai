// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { PlanEditorForm, type SyllabusSource } from '../PlanEditorForm';

function setup(syllabus: string, syllabusSource: SyllabusSource, citationsCount: number) {
  return render(
    <PlanEditorForm
      syllabus={syllabus}
      onChangeSyllabus={() => {}}
      generalObjectives=""
      onChangeGeneralObjectives={() => {}}
      bloomBadges={[]}
      methodology=""
      onChangeMethodology={() => {}}
      isAiLocked={false}
      syllabusSource={syllabusSource}
      citationsCount={citationsCount}
    />
  );
}

describe('PlanEditorForm — selo de proveniência da ementa', () => {
  afterEach(cleanup);

  it('ementa vazia: pendente', () => {
    setup('', null, 0);
    expect(screen.getByText('Pendente de Elaboração')).toBeTruthy();
  });

  it('sugestão da IA com trechos do acervo diz quantos trechos fundamentaram', () => {
    setup('texto', 'ai', 2);
    expect(screen.getByText('Sugestão da IA · 2 trecho(s) do acervo')).toBeTruthy();
  });

  it('sugestão da IA sem trechos nunca afirma "fundamentado no RAG"', () => {
    setup('texto', 'ai', 0);
    expect(screen.getByText('Sugestão da IA · sem trechos do acervo')).toBeTruthy();
    expect(screen.queryByText(/Fundamentado no RAG/)).toBeNull();
  });

  it('texto digitado pelo professor é rotulado como dele', () => {
    setup('texto', 'edited', 5);
    expect(screen.getByText('Redigida pelo professor')).toBeTruthy();
  });

  it('texto carregado de um plano salvo é rotulado como salvo', () => {
    setup('texto', 'saved', 0);
    expect(screen.getByText('Texto salvo no plano')).toBeTruthy();
  });
});
