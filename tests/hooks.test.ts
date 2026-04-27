import { describe, expect, it } from "vitest";
import type { SweetLinkScreenshotHook } from "../shared/src";
import { buildScreenshotHooks } from "../src/screenshot-hooks";

const defaultElementHooks: SweetLinkScreenshotHook[] = [
  { type: "scrollIntoView", selector: "#card", block: "center" },
  { type: "waitForSelector", selector: "#card", visibility: "visible", timeoutMs: 12_000 },
  { type: "waitForIdle", frameCount: 2, timeoutMs: 4000 },
];

describe("buildScreenshotHooks", () => {
  it("applies default scroll/wait/idle when a selector is provided", () => {
    const hooks = buildScreenshotHooks({
      selector: "#card",
      scrollIntoView: false,
      scrollSelector: undefined,
      waitSelector: undefined,
      waitVisible: undefined,
      waitTimeout: undefined,
      delayMs: undefined,
      beforeScript: undefined,
    });

    expect(hooks).toEqual(defaultElementHooks);
  });

  it("honours manual overrides without duplicating hooks", () => {
    const hooks = buildScreenshotHooks({
      selector: "#card",
      scrollIntoView: true,
      scrollSelector: ".custom-scroll",
      waitSelector: ".custom-wait",
      waitVisible: false,
      waitTimeout: 5000,
      delayMs: 1500,
      beforeScript: "await new Promise(r => setTimeout(r, 10));",
    });

    expect(hooks).toEqual([
      { type: "scrollIntoView", selector: ".custom-scroll", block: "center" },
      { type: "waitForSelector", selector: ".custom-wait", visibility: "any", timeoutMs: 5000 },
      { type: "waitForIdle", frameCount: 2, timeoutMs: 4000 },
      { type: "wait", ms: 1500 },
      { type: "script", code: "await new Promise(r => setTimeout(r, 10));" },
    ]);
  });

  it("adds a small idle wait for full-page captures", () => {
    const hooks = buildScreenshotHooks({
      selector: null,
      scrollIntoView: false,
      scrollSelector: undefined,
      waitSelector: undefined,
      waitVisible: undefined,
      waitTimeout: undefined,
      delayMs: undefined,
      beforeScript: undefined,
    });

    expect(hooks).toEqual([{ type: "waitForIdle", frameCount: 1, timeoutMs: 2000 }]);
  });
});
