// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/adaptive/adaptive-modal', () => ({
  AdaptiveModal: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
}));
vi.mock('@/components/ui/advanced-combobox', () => ({
  AdvancedCombobox: ({ id, label, items, selectedId, onSelect }: {
    id?: string; label?: string; items: { id: string; title: string }[]; selectedId: string | null; onSelect: (id: string) => void;
  }) => (
    <div>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={selectedId ?? ''} onChange={(e) => onSelect(e.target.value)}>
        <option value="">—</option>
        {items.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
      </select>
    </div>
  ),
}));

import { EnrollStudentModal } from '../EnrollStudentModal';

const CLASS_ID = 'cclass00001';
const mk = (id: string, name: string, enrollment: string | null, cls: { id: string; name: string; code: string } | null) => ({
  id, name, email: `${id}@x.br`, enrollment, classId: cls?.id ?? null, createdAt: '', class: cls,
});
const here = mk('s1', 'Ana Souza', 'A001', { id: CLASS_ID, name: '3º ADS', code: 'ADS-3A' });
const other = mk('s2', 'Bia Lima', 'A002', { id: 'cclass00002', name: '1º ADS', code: 'ADS-1A' });
const free = mk('s3', 'Caio Reis', null, null);

function setup(students: unknown[]) {
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') return new Response(JSON.stringify({ success: true, student: { id: 's2' } }));
    return new Response(JSON.stringify({ success: true, students }));
  });
  vi.stubGlobal('fetch', fn);
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();
  render(<EnrollStudentModal open onOpenChange={onOpenChange} classId={CLASS_ID} className="3º ADS" onSuccess={onSuccess} />);
  return { fn, onOpenChange, onSuccess };
}

describe('EnrollStudentModal', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('exclui alunos da turma atual e rotula os demais', async () => {
    setup([here, other, free]);
    await screen.findByRole('option', { name: 'Bia Lima · A002 · 1º ADS' });
    expect(screen.getByRole('option', { name: 'Caio Reis · sem matrícula · Sem turma' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Ana Souza/ })).toBeNull();
  });

  it('avisa que o aluno será movido e envia PUT com classId', async () => {
    const { fn, onOpenChange, onSuccess } = setup([other, free]);
    const select = await screen.findByLabelText('Aluno');
    await screen.findByRole('option', { name: /Bia Lima/ });
    fireEvent.change(select, { target: { value: 's2' } });
    expect(screen.getByText('Será movido de 1º ADS para 3º ADS.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Matricular' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const put = fn.mock.calls.find(([, i]) => i?.method === 'PUT')!;
    expect(put[0]).toBe('/api/v1/admin/students');
    expect(JSON.parse(put[1]!.body as string)).toEqual({ id: 's2', classId: CLASS_ID });
  });

  it('não avisa quando o aluno está sem turma', async () => {
    setup([other, free]);
    const select = await screen.findByLabelText('Aluno');
    await screen.findByRole('option', { name: /Caio Reis/ });
    fireEvent.change(select, { target: { value: 's3' } });
    expect(screen.queryByText(/Será movido/)).toBeNull();
  });

  it('mostra estado vazio e desabilita o envio', async () => {
    setup([here]);
    await screen.findByText('Todos os alunos já estão nesta turma.');
    expect((screen.getByRole('button', { name: 'Matricular' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
