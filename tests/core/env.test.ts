import { describe, expect, it, vi } from "vitest";

const envModule = await import("../../src/core/env");
const { cloneProcessEnv, readLocalEnvString, readCommandOptions } = envModule;

describe("cloneProcessEnv", () => {
  it("returns a shallow copy that can be mutated without affecting process.env", () => {
    process.env.TEST_CLONE_VAR = "original";

    const copy = cloneProcessEnv();

    copy.TEST_CLONE_VAR = "mutated";
    expect(process.env.TEST_CLONE_VAR).toBe("original");
  });
});

describe("readLocalEnvString", () => {
  it("returns trimmed strings and null when the variable is missing or empty", () => {
    process.env.TEST_STRING_PRESENT = "  value  ";
    process.env.TEST_STRING_EMPTY = "   ";
    const missingKey = "__SWEETLINK_CORE_ENV_TEST_MISSING__";
    Reflect.deleteProperty(process.env, missingKey);

    expect(readLocalEnvString("TEST_STRING_PRESENT")).toBe("value");
    expect(readLocalEnvString("TEST_STRING_EMPTY")).toBeNull();
    expect(readLocalEnvString(missingKey)).toBeNull();
  });
});

describe("readCommandOptions", () => {
  it("prefers optsWithGlobals when available", () => {
    const optsWithGlobals = vi.fn().mockReturnValue({ timeout: 100 });
    const command = {
      optsWithGlobals,
      opts: vi.fn(),
    } as unknown as import("commander").Command;

    const result = readCommandOptions<{ timeout: number }>(command);

    expect(result).toEqual({ timeout: 100 });
    expect(optsWithGlobals).toHaveBeenCalled();
    expect(command.opts).not.toHaveBeenCalled();
  });

  it("falls back to opts when optsWithGlobals is not defined", () => {
    const command = {
      opts: vi.fn().mockReturnValue({ verbose: true }),
    } as unknown as import("commander").Command;

    expect(readCommandOptions<{ verbose: boolean }>(command)).toEqual({ verbose: true });
  });
});
