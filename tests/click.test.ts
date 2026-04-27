import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let buildClickScript: (typeof import("../src/index"))["buildClickScript"];

beforeAll(async () => {
  vi.stubEnv("SWEETLINK_CLI_TEST", "1");
  vi.resetModules();
  ({ buildClickScript } = await import("../src/index"));
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("buildClickScript", () => {
  it("includes scroll and bubbling by default", () => {
    const script = buildClickScript({ selector: "#login", scrollIntoView: true, bubbles: true });
    expect(script).toContain('document.querySelector("#login")');
    expect(script).toContain("target.scrollIntoView");
    expect(script).toContain("bubbles: true");
  });

  it("omits scroll logic when disabled", () => {
    const script = buildClickScript({ selector: "#login", scrollIntoView: false, bubbles: true });
    expect(script).not.toContain("scrollIntoView");
  });

  it("supports non-bubbling events", () => {
    const script = buildClickScript({ selector: "#login", scrollIntoView: true, bubbles: false });
    expect(script).toContain("bubbles: false");
  });
});
