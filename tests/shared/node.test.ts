import { describe, expect, it, vi } from "vitest";

const accessMock = vi.fn();
const readFileMock = vi.fn();
const writeFileMock = vi.fn();
const mkdirMock = vi.fn();

vi.mock("node:fs/promises", () => ({
  access: accessMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
  mkdir: mkdirMock,
}));

vi.mock("node:os", () => ({
  default: { homedir: () => "/tmp" },
  homedir: () => "/tmp",
}));

const sweetLinkEnvMock = { secret: "", secretPath: "/tmp/.sweetlink/secret.key" };

vi.mock("../../shared/src/env", () => ({
  sweetLinkEnv: sweetLinkEnvMock,
  readSweetLinkEnv: () => sweetLinkEnvMock,
}));

vi.mock("node:crypto", () => ({
  randomBytes: () => Buffer.from("generated-secret"),
}));

const { resolveSweetLinkSecret, getDefaultSweetLinkSecretPath } =
  await import("../../shared/src/node");

describe("resolveSweetLinkSecret", () => {
  it("returns the env secret when configured", async () => {
    sweetLinkEnvMock.secret = "env-secret-value-with-sufficient-length-1234567890";

    await expect(resolveSweetLinkSecret()).resolves.toEqual({
      secret: sweetLinkEnvMock.secret,
      source: "env",
    });
  });

  it("reads secrets from disk when present", async () => {
    sweetLinkEnvMock.secret = "";
    sweetLinkEnvMock.secretPath = getDefaultSweetLinkSecretPath();
    accessMock.mockResolvedValueOnce(undefined);
    readFileMock.mockResolvedValueOnce("file-secret-value-should-be-long-enough-12345\n");

    const secret = await resolveSweetLinkSecret();

    expect(secret).toEqual({
      secret: "file-secret-value-should-be-long-enough-12345",
      source: "file",
      path: getDefaultSweetLinkSecretPath(),
    });
    expect(accessMock).toHaveBeenCalled();
  });

  it("reads the file named by SWEETLINK_SECRET_PATH when no path is passed", async () => {
    sweetLinkEnvMock.secret = "";
    sweetLinkEnvMock.secretPath = "/tmp/from-env.key";
    accessMock.mockResolvedValueOnce(undefined);
    readFileMock.mockResolvedValueOnce("file-secret-value-should-be-long-enough-12345\n");

    const secret = await resolveSweetLinkSecret();

    expect(secret).toEqual({
      secret: "file-secret-value-should-be-long-enough-12345",
      source: "file",
      path: "/tmp/from-env.key",
    });
  });

  it("auto-creates secrets when allowed", async () => {
    sweetLinkEnvMock.secret = "";
    accessMock.mockRejectedValueOnce(new Error("missing"));

    const secret = await resolveSweetLinkSecret({
      autoCreate: true,
      secretPath: "/tmp/custom.key",
    });

    expect(secret.source).toBe("generated");
    expect(writeFileMock).toHaveBeenCalledWith(
      "/tmp/custom.key",
      expect.stringContaining("Z2VuZXJhdGVkLXNlY3JldA"),
      {
        mode: 0o600,
      },
    );
  });
});
