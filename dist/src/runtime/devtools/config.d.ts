import type { DevToolsConfig, DevToolsState } from './types.js';
export declare function loadDevToolsConfig(): Promise<DevToolsConfig | null>;
export declare function saveDevToolsConfig(patch: Partial<DevToolsConfig> & {
    devtoolsUrl: string;
}): Promise<void>;
export declare function loadDevToolsState(): Promise<DevToolsState | null>;
export declare function saveDevToolsState(state: DevToolsState): Promise<void>;
export declare function deriveDevtoolsLinkInfo(config: DevToolsConfig | null, state: DevToolsState | null): {
    endpoint: string | null;
    sessionIds: Set<string>;
};
//# sourceMappingURL=config.d.ts.map