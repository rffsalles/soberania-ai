// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LessonBadges } from '../LessonBadges';

afterEach(cleanup);

const STEP = { timeSeconds: 0, timeRange: '00:00-10:00', activity: 'Abertura', description: 'Descrição' };
const complete = { classNumber: 3, topicTitle: 'Modelagem', dailyObjective: 'Obj', timeScript: [STEP] };
const empty = { classNumber: 3, topicTitle: 'Aula 3', dailyObjective: '', timeScript: [] };

describe('LessonBadges', () => {
  it('rascunho pronta: Rascunho + Pronta para publicar', () => {
    render(<LessonBadges lesson={{ ...complete, status: 'DRAFT' }} />);
    expect(screen.getByText('Rascunho')).toBeTruthy();
    expect(screen.getByText('Pronta para publicar')).toBeTruthy();
    expect(screen.queryByText('Incompleta')).toBeNull();
  });
  it('rascunho incompleta: Rascunho + Incompleta com motivo no title', () => {
    render(<LessonBadges lesson={{ ...empty, status: 'DRAFT' }} />);
    expect(screen.getByText('Rascunho')).toBeTruthy();
    expect(screen.getByText('Incompleta').getAttribute('title')).toBe('Defina um título diferente de "Aula N".');
  });
  it('publicada pronta: só Publicada', () => {
    render(<LessonBadges lesson={{ ...complete, status: 'PUBLISHED' }} />);
    expect(screen.getByText('Publicada')).toBeTruthy();
    expect(screen.queryByText('Pronta para publicar')).toBeNull();
    expect(screen.queryByText('Incompleta')).toBeNull();
  });
  it('publicada incompleta: Publicada + Incompleta', () => {
    render(<LessonBadges lesson={{ ...empty, status: 'PUBLISHED' }} />);
    expect(screen.getByText('Publicada')).toBeTruthy();
    expect(screen.getByText('Incompleta')).toBeTruthy();
  });
  it('showReason: mostra o motivo como texto quando incompleta', () => {
    render(<LessonBadges lesson={{ ...empty, status: 'DRAFT' }} showReason />);
    expect(screen.getByText('Defina um título diferente de "Aula N".', { selector: 'p, span, div' })).toBeTruthy();
  });
  it('sem showReason: o motivo não aparece como texto', () => {
    render(<LessonBadges lesson={{ ...empty, status: 'DRAFT' }} />);
    expect(screen.queryByText('Defina um título diferente de "Aula N".')).toBeNull();
  });
  it('showReason com aula pronta: não mostra motivo', () => {
    const { container } = render(<LessonBadges lesson={{ ...complete, status: 'DRAFT' }} showReason />);
    expect(container.textContent).not.toContain('Defina');
    expect(container.textContent).not.toContain('Preencha');
    expect(container.textContent).not.toContain('Adicione');
  });
});
