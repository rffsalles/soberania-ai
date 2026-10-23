// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useDocumentInspection } from '../use-document-inspection';

describe('useDocumentInspection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('entrega os metadados ao chamador e expõe se a IA foi aplicada e a categoria sugerida', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: true,
            metadata: {
              title: 'Matemática Básica',
              author: 'Fernando Guerra',
              categories: ['Banco de Dados'],
              suggestedCategory: 'Matemática',
              aiApplied: true,
              source: 'ai',
            },
          }),
          { status: 200 }
        )
      )
    );
    const onMetadata = vi.fn();
    const { result } = renderHook(() => useDocumentInspection(onMetadata));

    await act(async () => {
      await result.current.inspect(new File(['x'], 'mat.pdf'));
    });

    await waitFor(() => expect(result.current.isInspecting).toBe(false));
    expect(onMetadata).toHaveBeenCalledWith({
      title: 'Matemática Básica',
      author: 'Fernando Guerra',
      categories: ['Banco de Dados'],
    });
    expect(result.current.inspection).toEqual({ aiApplied: true, source: 'ai', suggestedCategory: 'Matemática' });
  });

  it('marca aiApplied=false quando a resposta veio da heurística e limpa no reset', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: true,
            metadata: { title: 'doc', author: '', categories: [], aiApplied: false },
          }),
          { status: 200 }
        )
      )
    );
    const onMetadata = vi.fn();
    const { result } = renderHook(() => useDocumentInspection(onMetadata));

    await act(async () => {
      await result.current.inspect(new File(['x'], 'doc.pdf'));
    });
    // Resposta sem `source` (servidor antigo): o hook assume a origem mais fraca.
    expect(result.current.inspection).toEqual({ aiApplied: false, source: 'filename', suggestedCategory: undefined });
    expect(onMetadata).toHaveBeenCalledWith({ title: 'doc', author: '', categories: [] });

    act(() => result.current.reset());
    expect(result.current.inspection).toBeNull();
  });

  it('não chama o callback quando a inspeção falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('erro', { status: 500 })));
    const onMetadata = vi.fn();
    const { result } = renderHook(() => useDocumentInspection(onMetadata));

    await act(async () => {
      await result.current.inspect(new File(['x'], 'doc.pdf'));
    });

    expect(onMetadata).not.toHaveBeenCalled();
    expect(result.current.inspection).toBeNull();
    expect(result.current.isInspecting).toBe(false);
  });
});
