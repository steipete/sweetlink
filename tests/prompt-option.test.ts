import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let resolvePromptOption: (typeof import("../src/index"))["resolvePromptOption"];

beforeAll(async () => {
  vi.stubEnv("SWEETLINK_CLI_TEST", "1");
  vi.resetModules();
  ({ resolvePromptOption } = await import("../src/index"));
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("resolvePromptOption", () => {
  it("returns trimmed prompt when provided", () => {
    expect(resolvePromptOption({ prompt: "  Describe the chart  " })).toBe("Describe the chart");
  });

  it("falls back to --question alias", () => {
    expect(resolvePromptOption({ question: "  Any anomalies?  " })).toBe("Any anomalies?");
  });

  it("returns undefined for empty input", () => {
    expect(resolvePromptOption({ prompt: "   " })).toBeUndefined();
    expect(resolvePromptOption({})).toBeUndefined();
  });
});
