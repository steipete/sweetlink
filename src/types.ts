export interface CliConfig {
  readonly appLabel: string;
  readonly appBaseUrl: string;
  readonly daemonBaseUrl: string;
  readonly adminApiKey: string | null;
  readonly devBootstrap: DevBootstrapConfig | null;
  readonly oauthScriptPath: string | null;
  readonly servers: Record<string, ServerConfig>;
}

export interface DevBootstrapConfig {
  readonly endpoint: string | null;
  readonly loginPath: string | null;
  readonly redirectParam: string | null;
}

export type CachedCliTokenSource = 'secret' | 'api';

export interface ServerConfig {
  readonly env: string;
  readonly start: string[] | null;
  readonly check: string[] | null;
  readonly cwd: string | null;
  readonly timeoutMs: number | null;
}
