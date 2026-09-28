import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModalTransition } from "./useModalTransition";

describe("useModalTransition", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("flips closing to true immediately, but delays onClose until the CSS animation would finish", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useModalTransition(onClose, 180));

    expect(result.current.closing).toBe(false);

    act(() => result.current.requestClose());
    expect(result.current.closing).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(179));
    expect(onClose).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("respects a custom duration", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useModalTransition(onClose, 500));

    act(() => result.current.requestClose());
    act(() => vi.advanceTimersByTime(499));
    expect(onClose).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
