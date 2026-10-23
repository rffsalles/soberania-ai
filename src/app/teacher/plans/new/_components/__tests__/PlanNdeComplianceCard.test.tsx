// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DEFAULT_NDE_COMPLIANCE_STATUS } from '@/lib/constants/teaching';
import { PlanNdeComplianceCard } from '../PlanNdeComplianceCard';
import type { NdeComplianceData } from '../../types';

const empty: NdeComplianceData = {
  totalHours: null,
  theoryHours: null,
  practiceHours: null,
  ndeComplianceStatus: DEFAULT_NDE_COMPLIANCE_STATUS,
};

describe('PlanNdeComplianceCard', () => {
  afterEach(cleanup);

  it('plano novo começa com carga horária vazia, sem 80/60/20', () => {
    render(<PlanNdeComplianceCard data={empty} onChange={() => {}} />);
    expect((screen.getByLabelText('Carga Horária Total (horas) *') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Teoria (h)') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Prática / Lab (h)') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText(/≠ Total/)).toBeNull();
  });

  it('digitar um número informa o valor; apagar volta a null', () => {
    const seen: NdeComplianceData[] = [];
    function Harness() {
      const [data, setData] = React.useState<NdeComplianceData>(empty);
      return (
        <PlanNdeComplianceCard
          data={data}
          onChange={(next) => {
            seen.push(next);
            setData(next);
          }}
        />
      );
    }
    render(<Harness />);
    const total = screen.getByLabelText('Carga Horária Total (horas) *');
    fireEvent.change(total, { target: { value: '72' } });
    expect(seen.at(-1)).toEqual({ ...empty, totalHours: 72 });
    fireEvent.change(total, { target: { value: '' } });
    expect(seen.at(-1)).toEqual({ ...empty, totalHours: null });
  });

  it('avisa quando teoria + prática não bate com o total informado', () => {
    render(<PlanNdeComplianceCard data={{ ...empty, totalHours: 80, theoryHours: 60, practiceHours: 10 }} onChange={() => {}} />);
    expect(screen.getByText(/≠ Total/)).toBeTruthy();
  });
});
