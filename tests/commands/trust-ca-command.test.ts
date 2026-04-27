import { regex } from "arkregex";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const noop = () => {
  /* suppress console noise */
};
const MKCERT_EXIT_PATTERN = regex.as("mkcert exited");

const accessMock = vi.fn();

vi.mock("node:fs/promises", () => ({
  access: accessMock,
}));

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

const { registerTrustCaCommand } = await import("../../src/commands/trust-ca");

beforeEach(() => {
  accessMock.mockReset();
  spawnMock.mockReset();
});

describe("registerTrustCaCommand", () => {
  it("uses an explicit mkcert path and resolves on success", async () => {
    const program = new Command();
    registerTrustCaCommand(program);

    accessMock.mockResolvedValue(undefined);
    const child = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (event === "exit") {
          setImmediate(() => handler(0));
        }
        return child;
      }),
    } as unknown as ReturnType<typeof spawnMock>;
    spawnMock.mockReturnValue(child);

    const logSpy = vi.spyOn(console, "log").mockImplementation(noop);

    await program.parseAsync(["trust-ca", "--mkcert", "/usr/local/bin/mkcert"], { from: "user" });

    expect(accessMock).toHaveBeenCalledWith("/usr/local/bin/mkcert");
    expect(spawnMock).toHaveBeenCalledWith("/usr/local/bin/mkcert", ["-install"], {
      stdio: "inherit",
    });
    expect(logSpy).toHaveBeenCalledWith(
      "✅ SweetLink certificate installed. Reload https://localhost:4455 in your browser to trust the daemon.",
    );

    logSpy.mockRestore();
  });

  it("rejects when mkcert exits with a non-zero code", async () => {
    const program = new Command();
    registerTrustCaCommand(program);

    const child = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (event === "exit") {
          setImmediate(() => handler(1));
        }
        return child;
      }),
    } as unknown as ReturnType<typeof spawnMock>;
    spawnMock.mockReturnValue(child);

    await expect(program.parseAsync(["trust-ca"], { from: "user" })).rejects.toThrow(
      MKCERT_EXIT_PATTERN,
    );
  });
});
