import type { Command } from 'commander';
/**
 * Returns a shallow copy of the current process environment so child processes
 * can inherit without mutating the global map.
 */
export declare const cloneProcessEnv: () => NodeJS.ProcessEnv;
/** Returns a trimmed environment variable or null when unset. */
export declare const readLocalEnvString: (key: string) => string | null;
/** Extracts typed Commander options while preserving globals. */
export declare const readCommandOptions: <T extends object>(command: Command) => T;
//# sourceMappingURL=env.d.ts.map