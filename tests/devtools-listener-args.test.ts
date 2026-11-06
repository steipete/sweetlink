import { describe, expect, it } from "vitest";
import { devToolsListenerArgs } from "../src/runtime/devtools/background.js";

describe("devToolsListenerArgs", () => {
  it("loads tsx only for a TypeScript entry", () => {
    expect(devToolsListenerArgs("C:/app/src/index.ts", ["--session", "abc"])).toEqual([
      "--loader",
      "tsx",
      "C:/app/src/index.ts",
      "devtools",
      "listen",
      "--background",
      "--session",
      "abc",
    ]);
  });

  it("starts a compiled JavaScript entry with plain node arguments", () => {
    expect(devToolsListenerArgs("C:/app/dist/src/index.js", [])).toEqual([
      "C:/app/dist/src/index.js",
      "devtools",
      "listen",
      "--background",
    ]);
  });
});
