// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { OfferingContextCard } from '../OfferingContextCard';
import { offeringADS } from './fixtures';

afterEach(cleanup);

describe('OfferingContextCard', () => {
  it('mostra curso, turma, período letivo e carga horária da matriz', () => {
    const { container } = render(<OfferingContextCard offering={offeringADS} />);
    expect(screen.getByText('Contexto da oferta')).toBeTruthy();
    expect([...container.querySelectorAll('dt')].map((e) => e.textContent)).toEqual([
      'Curso',
      'Turma',
      'Período letivo',
      'Carga horária da matriz',
    ]);
    expect([...container.querySelectorAll('dd')].map((e) => e.textContent)).toEqual([
      'Análise e Desenvolvimento de Sistemas (ADS)',
      '3º Semestre · ADS',
      '1º Semestre / 2026 (2026.1)',
      '80h',
    ]);
    expect(container.querySelectorAll('input, select, textarea').length).toBe(0);
  });

  it('não renderiza sem oferta', () => {
    const { container } = render(<OfferingContextCard offering={null} />);
    expect(container.firstChild).toBeNull();
  });
});
