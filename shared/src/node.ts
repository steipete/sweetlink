import { randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { debuglog } from "node:util";
import { sweetLinkEnv } from "./env.js";

const DEFAULT_SECRET_PATH = path.join(os.homedir(), ".sweetlink", "secret.key");

export interface ResolveSweetLinkSecretOptions {
  readonly autoCreate?: boolean;
  readonly secretPath?: string;
}

export interface SweetLinkSecretResolution {
  readonly secret: string;
  readonly source: "env" | "file" | "generated";
  readonly path?: string;
}

const FS_PROMISES_MODULE = "node:fs/promises";

type FsPromisesModule = typeof import("node:fs/promises");

let cachedFsPromises: FsPromisesModule | null = null;
const debug = debuglog("sweetlink");

function ensureNodeRuntime(): void {
  const globalScope = globalThis as {
    window?: unknown;
    process?: { versions?: { node?: string } };
  };
  const nodeVersion = globalScope.process?.versions?.node;
  if (nodeVersion) {
    return;
  }
  if (globalScope.window !== undefined) {
    throw new TypeError(
      "SweetLink secret resolution requires a Node.js runtime; detected browser-like window without Node metadata.",
    );
  }
  throw new TypeError(
    "Node.js runtime metadata is unavailable; refusing to access SweetLink secrets.",
  );
}
async function loadFsModule(): Promise<FsPromisesModule> {
  if (cachedFsPromises) {
    return cachedFsPromises;
  }

  ensureNodeRuntime();
  cachedFsPromises = (await import(FS_PROMISES_MODULE)) as FsPromisesModule;
  return cachedFsPromises;
}

export async function resolveSweetLinkSecret(
  options: ResolveSweetLinkSecretOptions = {},
): Promise<SweetLinkSecretResolution> {
  const envSecret = sweetLinkEnv.secret;
  if (envSecret && envSecret.length >= 32) {
    return { secret: envSecret, source: "env" };
  }

  const secretPath = options.secretPath ?? DEFAULT_SECRET_PATH;
  try {
    const fsModule = await loadFsModule();
    const readSecretFile = async () => {
      await fsModule.access(secretPath, fsConstants.R_OK);
      return fsModule.readFile(secretPath, "utf8");
    };
    const secretFileContents = await readSecretFile();
    const fileSecret = secretFileContents.trim();
    if (fileSecret.length >= 32) {
      return { secret: fileSecret, source: "file", path: secretPath };
    }
  } catch (error) {
    debug("Unable to read SweetLink secret from file; falling back to autoCreate logic.", {
      path: secretPath,
      error,
    });
  }

  if (!options.autoCreate) {
    throw new Error(
      "SWEETLINK_SECRET is not configured; provide env var or run daemon with autoCreate enabled",
    );
  }

  const generated = randomBytes(48).toString("base64url");
  const directory = path.dirname(secretPath);
  const { mkdir, writeFile } = await loadFsModule();
  await mkdir(directory, { recursive: true });
  await writeFile(secretPath, `${generated}\n`, { mode: 0o600 });
  return { secret: generated, source: "generated", path: secretPath };
}

export function getDefaultSweetLinkSecretPath(): string {
  return DEFAULT_SECRET_PATH;
}
