import os from "node:os";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SweetLinkBootstrapDiagnostics } from "../src/index";

const noop = () => {
  /* mute console in tests */
};

let diagnosticsContainBlockingIssues: (typeof import("../src/index"))["diagnosticsContainBlockingIssues"];
let logBootstrapDiagnostics: (typeof import("../src/index"))["logBootstrapDiagnostics"];
let formatPathForDisplay: (typeof import("../src/index"))["formatPathForDisplay"];

beforeAll(async () => {
  vi.stubEnv("SWEETLINK_CLI_TEST", "1");
  vi.resetModules();
  ({ diagnosticsContainBlockingIssues, logBootstrapDiagnostics, formatPathForDisplay } =
    await import("../src/index"));
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("diagnosticsContainBlockingIssues", () => {
  it("ignores benign console output", () => {
    const diagnostics: SweetLinkBootstrapDiagnostics = {
      readyState: "complete",
      errors: [{ type: "log", message: "Loaded ok" }],
    };

    expect(diagnosticsContainBlockingIssues(diagnostics)).toBe(false);
  });

  it("flags unhandled rejections as blocking", () => {
    const diagnostics: SweetLinkBootstrapDiagnostics = {
      errors: [{ type: "unhandledrejection", message: "boom" }],
    };

    expect(diagnosticsContainBlockingIssues(diagnostics)).toBe(true);
  });

  it("flags route and overlay errors", () => {
    const diagnostics: SweetLinkBootstrapDiagnostics = {
      overlayText: "Next.js overlay",
      nextRouteError: { message: "Route exploded" },
    };

    expect(diagnosticsContainBlockingIssues(diagnostics)).toBe(true);
  });

  it("treats unknown console types as suspicious", () => {
    const diagnostics: SweetLinkBootstrapDiagnostics = {
      errors: [{ type: "fatal", message: "Something bad" }],
    };

    expect(diagnosticsContainBlockingIssues(diagnostics)).toBe(true);
  });
});

describe("logBootstrapDiagnostics", () => {
  it("logs baseline diagnostics and console errors", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(noop);
    const diagnostics: SweetLinkBootstrapDiagnostics = {
      readyState: "interactive",
      autoFlag: true,
      bootstrapEmits: 1,
      sessionStorageAuto: "pending",
      errors: [
        { type: "error", message: "Boom", stack: "Error: Boom\n    at root.tsx:10" },
        { type: "log", message: "Ignored log" },
      ],
    };

    logBootstrapDiagnostics("Latest", diagnostics);

    expect(warn).toHaveBeenCalledWith(
      "Latest document=interactive, autoFlag=set, emits=1, sessionStorage=pending.",
    );
    expect(
      warn.mock.calls
        .map((call) => call[0])
        .some((line) => typeof line === "string" && line.includes("console error")),
    ).toBe(true);
    expect(
      warn.mock.calls
        .map((call) => call[0])
        .every((line) => typeof line === "string" && !line.includes("[SweetLink")),
    ).toBe(true);
    warn.mockRestore();
  });

  it("limits output to 100 lines and reports truncation", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(noop);
    const overlayText = Array.from({ length: 120 }, (_, index) => `Overlay line ${index + 1}`).join(
      "\n",
    );
    const diagnostics: SweetLinkBootstrapDiagnostics = {
      readyState: "loading",
      overlayText,
    };

    logBootstrapDiagnostics("Latest", diagnostics);

    expect(warn).toHaveBeenCalledTimes(101);
    const lastCall = warn.mock.calls.at(-1);
    expect(lastCall?.[0]).toContain("Console output truncated to 100 lines");
    warn.mockRestore();
  });
});

describe("formatPathForDisplay", () => {
  it("replaces the home directory with ~", () => {
    const home = os.homedir();
    const pathInsideHome = `${home}/projects/demo`;

    expect(formatPathForDisplay(pathInsideHome)).toBe(pathInsideHome.replace(home, "~"));
  });
});
