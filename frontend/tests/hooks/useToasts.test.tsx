import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useToasts } from "../../src/hooks/useToasts.ts";

describe("useToasts", () => {
  test("pushToast adds a toast", () => {
    const { result } = renderHook(() => useToasts());

    act(() => result.current.pushToast("hello"));

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.message).toBe("hello");
  });

  test("dismiss removes a specific toast, not all of them", () => {
    const { result } = renderHook(() => useToasts());

    act(() => result.current.pushToast("first"));
    act(() => result.current.pushToast("second"));
    const firstId = result.current.toasts[0]!.id;

    act(() => result.current.dismiss(firstId));

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.message).toBe("second");
  });

  test("multiple pushes produce independent toasts with distinct ids", () => {
    const { result } = renderHook(() => useToasts());

    act(() => {
      result.current.pushToast("a");
      result.current.pushToast("b");
    });

    expect(result.current.toasts).toHaveLength(2);
    expect(result.current.toasts[0]?.id).not.toBe(result.current.toasts[1]?.id);
  });
});
