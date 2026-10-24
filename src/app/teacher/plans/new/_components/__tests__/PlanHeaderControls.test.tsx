// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { offeringADS, offeringEM, LABEL_ADS, LABEL_EM } from './fixtures';

type Item = { id: string; title: string; subtitle?: string; badge?: string };
vi.mock('@/components/ui/advanced-combobox', () => ({
  AdvancedCombobox: ({ id, label, items, selectedId, onSelect, disabled, addNewLabel, onAddNewClick }: {
    id?: string; label?: string; items: Item[]; selectedId: string | null; onSelect: (id: string) => void;
    disabled?: boolean; addNewLabel?: string; onAddNewClick?: () => void;
  }) => (
    <div>
      <label htmlFor={id}>{label}</label>
      <select id={id} disabled={disabled} value={selectedId ?? ''} onChange={(e) => onSelect(e.target.value)}>
        <option value="">—</option>
        {items.map((i) => <option key={i.id} value={i.id}>{i.title}{i.subtitle ? `${" | "}${i.subtitle}` : ''}</option>)}
      </select>
      {addNewLabel && <button type="button" onClick={onAddNewClick}>{addNewLabel}</button>}
    </div>
  ),
  AdvancedMultiCombobox: ({ label }: { label: string }) => <div>{label}</div>,
}));
vi.mock('@/components/layout/provider-badge', () => ({ ProviderBadge: () => null }));

import { PlanHeaderControls, type PlanHeaderControlsProps } from '../PlanHeaderControls';

afterEach(() => cleanup());

function setup(overrides: Partial<PlanHeaderControlsProps> = {}) {
  const props: PlanHeaderControlsProps = {
    offerings: [offeringADS, offeringEM],
    selectedOfferingId: '',
    onSelectOffering: vi.fn(),
    activeOffering: null,
    offeringLocked: false,
    isAiLocked: true,
    isGeneratingAI: false,
    onGenerateAI: vi.fn(),
    ...overrides,
  };
  render(<PlanHeaderControls {...props} />);
  return props;
}

describe('PlanHeaderControls', () => {
  it('lista as ofertas rotuladas por formatOfferingLabel, sem seletor de período', () => {
    setup();
    const options = Array.from((screen.getByLabelText('Oferta *') as HTMLSelectElement).options).map((o) => o.text);
    expect(options).toEqual(['—', `${LABEL_ADS} | 3º Semestre · ADS`, `${LABEL_EM} | 2º Ano · EM`]);
    expect(screen.queryByText(/Período Letivo \/ Semestre/)).toBeNull();
    expect(screen.queryByText('Cadastrar novo período letivo...')).toBeNull();
    expect(screen.getByText('Não encontra a oferta? Peça ao administrador para cadastrá-la e alocar você.')).toBeTruthy();
    expect(screen.queryByText('Contexto da oferta')).toBeNull();
  });

  it('escolher uma oferta chama onSelectOffering com o id', () => {
    const props = setup();
    fireEvent.change(screen.getByLabelText('Oferta *'), { target: { value: 'csubject0001' } });
    expect(props.onSelectOffering).toHaveBeenCalledWith('csubject0001');
  });

  it('com oferta ativa mostra o cartão de contexto e o nome da disciplina', () => {
    setup({ activeOffering: offeringADS, selectedOfferingId: offeringADS.id });
    expect(screen.getByText('Plano de Ensino & Aprendizagem: Banco de Dados I')).toBeTruthy();
    expect(screen.getByText('Contexto da oferta')).toBeTruthy();
  });

  it('na edição o combobox de oferta fica desabilitado', () => {
    setup({ offeringLocked: true });
    expect((screen.getByLabelText('Oferta *') as HTMLSelectElement).disabled).toBe(true);
  });
});
