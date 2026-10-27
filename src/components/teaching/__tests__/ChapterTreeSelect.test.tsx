// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChapterTreeSelect } from '../ChapterTreeSelect';
import { MAT_BOOK, COMP_BOOK } from './chapter-tree-fixtures';

afterEach(cleanup);

function setup(selectedIds: string[] = []) {
  const onSelectionChange = vi.fn();
  render(<ChapterTreeSelect id="t" label="Capítulos desta aula" books={[MAT_BOOK, COMP_BOOK]} selectedIds={selectedIds} onSelectionChange={onSelectionChange} />);
  return { onSelectionChange, item: (name: string) => screen.getByRole('treeitem', { name }) };
}

describe('ChapterTreeSelect', () => {
  it('agrupa por livro, raízes visíveis e filhos recolhidos', () => {
    const { item } = setup();
    expect(screen.getByRole('tree')).toBeTruthy();
    expect(screen.getByText('Matemática Básica (Silva)')).toBeTruthy();
    expect(item('2 Unidade 2').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('treeitem', { name: '2.1 Produtos notáveis' })).toBeNull();
  });

  it('cada livro é um grupo nomeado; o cabeçalho visual fica fora da árvore acessível', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Matemática Básica (Silva)' });
    expect(group.querySelector('[role="treeitem"]')?.getAttribute('aria-label')).toBe('1 Unidade 1');
    expect(screen.getByRole('group', { name: 'Leituras Complementares (Souza)' })).toBeTruthy();
    expect(screen.getByText('Matemática Básica (Silva)').getAttribute('aria-hidden')).toBe('true');
  });

  it('marcar pai emite só o pai', () => {
    const { onSelectionChange, item } = setup(['s21']);
    fireEvent.click(item('2 Unidade 2'));
    expect(onSelectionChange).toHaveBeenCalledWith(['u2']);
  });

  it('raiz salva marca visualmente todos os descendentes', () => {
    const { item } = setup(['u2']);
    fireEvent.click(screen.getByRole('button', { name: 'Expandir 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expandir 2.2' }));
    expect(item('2.2.1 Operações com frações').getAttribute('aria-checked')).toBe('true');
  });

  it('desmarcar filho de pai marcado emite os irmãos restantes', () => {
    const { onSelectionChange, item } = setup(['u2']);
    fireEvent.click(screen.getByRole('button', { name: 'Expandir 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expandir 2.2' }));
    fireEvent.click(item('2.2.1 Operações com frações'));
    expect(onSelectionChange).toHaveBeenCalledWith(['s21', 's222']);
  });

  it('estado parcial no pai e no avô; seleção salva abre os ancestrais', () => {
    const { item } = setup(['s221']);
    expect(item('2 Unidade 2').getAttribute('aria-checked')).toBe('mixed');
    expect(item('2.2 Frações').getAttribute('aria-checked')).toBe('mixed');
    expect(item('2.2.1 Operações com frações').getAttribute('aria-checked')).toBe('true');
  });

  it('busca mostra os resultados com os ancestrais', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Buscar capítulos'), { target: { value: 'operações' } });
    expect(screen.getAllByRole('treeitem').map((e) => e.getAttribute('aria-label')))
      .toEqual(['2 Unidade 2', '2.2 Frações', '2.2.1 Operações com frações']);
    fireEvent.change(screen.getByLabelText('Buscar capítulos'), { target: { value: 'inexistente' } });
    expect(screen.getByText('Nenhum capítulo encontrado.')).toBeTruthy();
  });

  it('marcar durante a busca preserva a seleção oculta', () => {
    const { onSelectionChange, item } = setup(['x1']);
    fireEvent.change(screen.getByLabelText('Buscar capítulos'), { target: { value: 'frações' } });
    expect(screen.queryByRole('treeitem', { name: '1 Apêndice' })).toBeNull();
    fireEvent.click(item('2.2 Frações'));
    expect(onSelectionChange).toHaveBeenCalledWith(['s22', 'x1']);
  });

  it('teclado: setas navegam e expandem, espaço marca', () => {
    const { onSelectionChange, item } = setup();
    const u2 = item('2 Unidade 2');
    fireEvent.keyDown(u2, { key: 'ArrowRight' });
    expect(u2.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(u2, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(item('2.1 Produtos notáveis'));
    fireEvent.keyDown(document.activeElement!, { key: ' ' });
    expect(onSelectionChange).toHaveBeenCalledWith(['s21']);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(u2);
  });

  it('livros que chegam depois da montagem abrem os ancestrais da seleção', () => {
    const onSelectionChange = vi.fn();
    const props = { id: 't', label: 'Capítulos desta aula', selectedIds: ['s221'], onSelectionChange };
    const { rerender } = render(<ChapterTreeSelect {...props} books={[]} />);
    rerender(<ChapterTreeSelect {...props} books={[MAT_BOOK]} />);
    expect(screen.getByRole('treeitem', { name: '2.2 Frações' })).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: '2.2.1 Operações com frações' })).toBeTruthy();
  });

  it('livros que chegam depois não recolhem o que o professor abriu', () => {
    const onSelectionChange = vi.fn();
    const props = { id: 't', label: 'Capítulos desta aula', selectedIds: [], onSelectionChange };
    const { rerender } = render(<ChapterTreeSelect {...props} books={[MAT_BOOK]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Expandir 2' }));
    rerender(<ChapterTreeSelect {...props} books={[MAT_BOOK, COMP_BOOK]} />);
    expect(screen.getByRole('treeitem', { name: '2.1 Produtos notáveis' })).toBeTruthy();
  });
  it('Enter ou espaço no botão de expandir não alteram a seleção', () => {
    const { onSelectionChange } = setup();
    const expand = screen.getByRole('button', { name: 'Expandir 2' });
    fireEvent.keyDown(expand, { key: 'Enter' });
    fireEvent.keyDown(expand, { key: ' ' });
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('Home e End vão ao primeiro e ao último item visível', () => {
    const { item } = setup(['s221']);
    fireEvent.keyDown(item('2.2 Frações'), { key: 'End' });
    expect(document.activeElement).toBe(item('1 Apêndice'));
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(item('1 Unidade 1'));
  });
});
