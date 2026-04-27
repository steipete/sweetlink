import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let formatSessionHeadline: (typeof import("../src/index"))["formatSessionHeadline"];

beforeAll(async () => {
  vi.stubEnv("SWEETLINK_CLI_TEST", "1");
  vi.resetModules();
  ({ formatSessionHeadline } = await import("../src/index"));
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("formatSessionHeadline", () => {
  it("returns the session id when codename missing", () => {
    expect(formatSessionHeadline({ sessionId: "abc123" })).toBe("abc123");
  });

  it("includes codename when provided", () => {
    expect(formatSessionHeadline({ sessionId: "abc123", codename: "brisk-otter" })).toBe(
      "brisk-otter (abc123)",
    );
  });
});
