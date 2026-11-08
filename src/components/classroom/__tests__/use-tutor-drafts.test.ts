// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTutorDrafts } from "../use-tutor-drafts";

const draft = { stepIndex: 1, card: null, question: null, current: true };
const okRes = () =>
  new Response(JSON.stringify({ success: true, drafts: [draft] }), {
    status: 200,
  });

describe("useTutorDrafts", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => okRes());
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sem lessonPlanId não busca", async () => {
    const { result } = renderHook(() => useTutorDrafts(null, 0));
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.drafts).toEqual([]);
  });

  it("busca na montagem e de novo quando reloadKey muda", async () => {
    const { result, rerender } = renderHook(
      ({ k }) => useTutorDrafts("p1", k),
      { initialProps: { k: 0 as number | null } },
    );
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/v1/teacher/lessons/p1/tutor-drafts",
    );
    expect(result.current.drafts).toEqual([draft]);
    rerender({ k: 1 });
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falha mantém a lista anterior", async () => {
    const { result, rerender } = renderHook(
      ({ k }) => useTutorDrafts("p1", k),
      { initialProps: { k: 0 as number | null } },
    );
    await act(async () => {});
    fetchMock.mockImplementation(async () => {
      throw new Error("rede");
    });
    rerender({ k: 1 });
    await act(async () => {});
    expect(result.current.drafts).toEqual([draft]);
  });
});
