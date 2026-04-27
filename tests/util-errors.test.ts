import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const noop = () => {
  /* suppress console during tests */
};

function importErrorUtils() {
  return import("../src/util/errors");
}

describe("error utilities", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts human-readable messages from mixed event shapes", async () => {
    const { extractEventMessage } = await importErrorUtils();
    expect(extractEventMessage("boom", "prefix")).toBe("prefix: boom");
    expect(extractEventMessage(new Error("kaboom"))).toBe("kaboom");
    expect(extractEventMessage({ message: { detail: "nope" } })).toBe('{"detail":"nope"}');
    expect(extractEventMessage(123)).toBe("123");
  });

  it("labels errno-style exceptions and formats unknown values", async () => {
    const { describeUnknown, isErrnoException } = await importErrorUtils();
    const errnoLike = { code: "ENOENT", message: "file missing" } satisfies NodeJS.ErrnoException;
    expect(isErrnoException(errnoLike)).toBe(true);
    expect(isErrnoException({})).toBe(false);
    expect(describeUnknown(null, "n/a")).toBe("n/a");
    expect(describeUnknown(new Error("fail"))).toBe("fail");
    expect(describeUnknown({ ok: true })).toBe('{"ok":true}');

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeUnknown(circular, "fallback")).toBe("fallback");
  });

  it("suppresses debug logging when SWEETLINK_DEBUG is disabled", async () => {
    vi.stubEnv("SWEETLINK_DEBUG", "0");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);
    const { logDebugError } = await importErrorUtils();
    logDebugError("context", new Error("boom"));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("emits debug logs with the formatted error when SWEETLINK_DEBUG=1", async () => {
    vi.stubEnv("SWEETLINK_DEBUG", "1");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);
    const { logDebugError } = await importErrorUtils();
    const error = new Error("unexpected");
    logDebugError("session handshake", error);
    expect(warnSpy).toHaveBeenCalledWith("[SweetLink CLI] session handshake: unexpected", error);
  });
});
