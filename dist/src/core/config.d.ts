import type { Command } from 'commander';
import type { CliConfig, DevBootstrapConfig } from '../types.js';
interface ResolvedServerConfig {
    readonly env: string;
    readonly start: string[] | null;
    readonly check: string[] | null;
    readonly cwd: string | null;
    readonly timeoutMs: number | null;
}
export interface RootProgramOptions {
    readonly appLabel: string;
    readonly appUrl: string;
    readonly daemonUrl: string;
    readonly adminKey: string | null;
    readonly devBootstrap: DevBootstrapConfig | null;
    readonly oauthScriptPath: string | null;
    readonly servers: ResolvedServerConfig[];
}
/** Reads the root program options, falling back to defaults when values are missing. */
export declare const readRootProgramOptions: (command: Command) => RootProgramOptions;
/** Extracts SweetLink CLI configuration (app/daemon URLs and admin key). */
export declare function resolveConfig(command: Command): CliConfig;
export {};
//# sourceMappingURL=config.d.ts.map