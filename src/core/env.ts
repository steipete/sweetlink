import type { Command } from "commander";

/**
 * Returns a shallow copy of the current process environment so child processes
 * can inherit without mutating the global map.
 */
export const cloneProcessEnv = (): NodeJS.ProcessEnv => {
  // biome-ignore lint/style/noProcessEnv: child processes must inherit the current environment
  return { ...process.env };
};

/** Returns a trimmed environment variable or null when unset. */
export const readLocalEnvString = (key: string): string | null => {
  try {
    // biome-ignore lint/style/noProcessEnv: CLI utilities fall back to raw env variables when shared config is unavailable.
    if (typeof process === "undefined" || !process?.env) {
      return null;
    }
    // biome-ignore lint/style/noProcessEnv: CLI utilities fall back to raw env variables when shared config is unavailable.
    const raw = process.env[key];
    if (typeof raw !== "string") {
      return null;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
};

/** Extracts typed Commander options while preserving globals. */
export const readCommandOptions = <T extends object>(command: Command): T =>
  typeof command.optsWithGlobals === "function" ? command.optsWithGlobals<T>() : command.opts<T>();
