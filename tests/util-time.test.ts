import { describe, expect, it, vi } from "vitest";

const { delay } = await import("../src/util/time");

describe("delay utility", () => {
  it("resolves after the requested duration", async () => {
    vi.useFakeTimers();
    const pending = delay(500);
    vi.advanceTimersByTime(500);
    await expect(pending).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
