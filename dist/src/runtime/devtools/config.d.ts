export interface DevToolsConfig {
    readonly devtoolsUrl: string;
    readonly port: number;
    readonly userDataDir: string;
    readonly updatedAt: number;
    readonly targetUrl?: string;
    readonly sessionId?: string;
    readonly viewport?: {
        readonly width: number;
        readonly height: number;
        readonly deviceScaleFactor?: number;
    };
}
export interface DevToolsState {
    endpoint: string;
    sessionId?: string;
    viewport?: {
        readonly width: number;
        readonly height: number;
        readonly deviceScaleFactor?: number;
    };
    console: DevToolsConsoleEntry[];
    network: DevToolsNetworkEntry[];
    updatedAt: number;
}
export interface DevToolsConsoleEntry {
    readonly ts: number;
    readonly type: string;
    readonly text: string;
    readonly args: unknown[];
    readonly location?: {
        readonly url?: string;
        readonly lineNumber?: number;
        readonly columnNumber?: number;
    };
}
export interface DevToolsNetworkEntry {
    readonly ts: number;
    readonly method: string;
    readonly url: string;
    readonly status?: number;
    readonly resourceType?: string;
    readonly failureText?: string;
}
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