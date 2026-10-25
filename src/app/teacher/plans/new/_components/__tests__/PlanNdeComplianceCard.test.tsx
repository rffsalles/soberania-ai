// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DEFAULT_NDE_COMPLIANCE_STATUS } from '@/lib/constants/teaching';
import { PlanNdeComplianceCard } from '../PlanNdeComplianceCard';
import type { NdeComplianceData } from '../../types';

const empty: NdeComplianceData = {
  theoryHours: null,
  practiceHours: null,
  ndeComplianceStatus: DEFAULT_NDE_COMPLIANCE_STATUS,
};
const SUM_MSG = 'A soma das horas teóricas e práticas deve ser igual à carga horária da disciplina (80h).';

describe('PlanNdeComplianceCard', () => {
  afterEach(cleanup);

  it('carga total é somente leitura e mostra a carga da matriz', () => {
    render(<PlanNdeComplianceCard data={empty} workloadHours={80} onChange={() => {}} />);
    const total = screen.getByLabelText('Carga Horária Total (horas)') as HTMLInputElement;
    expect(total.value).toBe('80');
    expect(total.readOnly).toBe(true);
    expect(screen.getByText('Definida na matriz curricular')).toBeTruthy();
  });

  it('sem oferta o total mostra "—" e não há indicador de soma', () => {
    render(<PlanNdeComplianceCard data={empty} workloadHours={null} onChange={() => {}} />);
    expect((screen.getByLabelText('Carga Horária Total (horas)') as HTMLInputElement).value).toBe('—');
    expect(screen.queryByText(/de \d+h$/)).toBeNull();
  });

  it('plano novo começa com teoria e prática vazias, sem 80/60/20', () => {
    render(<PlanNdeComplianceCard data={empty} workloadHours={80} onChange={() => {}} />);
    expect((screen.getByLabelText('Teoria (h)') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Prática / Lab (h)') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText(SUM_MSG)).toBeNull();
  });

  it('digitar um número informa o valor; apagar volta a null', () => {
    const seen: NdeComplianceData[] = [];
    function Harness() {
      const [data, setData] = React.useState<NdeComplianceData>(empty);
      return (
        <PlanNdeComplianceCard
          data={data}
          workloadHours={80}
          onChange={(next) => {
            seen.push(next);
            setData(next);
          }}
        />
      );
    }
    render(<Harness />);
    const theory = screen.getByLabelText('Teoria (h)');
    fireEvent.change(theory, { target: { value: '48' } });
    expect(seen.at(-1)).toEqual({ ...empty, theoryHours: 48 });
    fireEvent.change(theory, { target: { value: '' } });
    expect(seen.at(-1)).toEqual({ ...empty, theoryHours: null });
  });

  it('mostra a soma e, quando bate, nenhuma mensagem de erro', () => {
    render(<PlanNdeComplianceCard data={{ ...empty, theoryHours: 60, practiceHours: 20 }} workloadHours={80} onChange={() => {}} />);
    expect(screen.getByText('60 + 20 = 80h de 80h')).toBeTruthy();
    expect(screen.queryByText(SUM_MSG)).toBeNull();
  });

  it('soma divergente mostra a mensagem do servidor inline', () => {
    render(<PlanNdeComplianceCard data={{ ...empty, theoryHours: 60, practiceHours: 10 }} workloadHours={80} onChange={() => {}} />);
    expect(screen.getByText('60 + 10 = 70h de 80h')).toBeTruthy();
    expect(screen.getByText(SUM_MSG)).toBeTruthy();
  });
});
