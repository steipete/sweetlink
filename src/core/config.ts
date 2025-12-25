import path from 'node:path';
import type { Command } from 'commander';
import { sweetLinkEnv } from '../env.js';
import type { CliConfig, DevBootstrapConfig } from '../types.js';
import { formatAppLabel, normalizeAppLabel } from '../util/app-label.js';
import { loadSweetLinkFileConfig } from './config-file.js';
import { readCommandOptions } from './env.js';

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

const normalizeUrlOption = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return fallback;
};

const normalizeAdminKey = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

/** Reads the root program options, falling back to defaults when values are missing. */
export const readRootProgramOptions = (command: Command): RootProgramOptions => {
  const rawOptions = readCommandOptions<{
    appLabel?: unknown;
    appUrl?: unknown;
    url?: unknown;
    daemonUrl?: unknown;
    adminKey?: unknown;
    port?: unknown;
    oauthScript?: unknown;
  }>(command);
  const { config } = loadSweetLinkFileConfig();
  let optionUrl: string | undefined;
  if (typeof rawOptions.appUrl === 'string') {
    optionUrl = rawOptions.appUrl;
  } else if (typeof rawOptions.url === 'string') {
    optionUrl = rawOptions.url;
  } else {
    optionUrl = undefined;
  }
  const optionPort = normalizePort(rawOptions.port);
  const configPort = typeof config.port === 'number' ? config.port : null;

  const fallbackAppUrl = resolveDefaultAppUrl({
    optionUrl,
    optionPort,
    configAppUrl: config.appUrl,
    configPort,
  });
  const fallbackDaemonUrl = config.daemonUrl ?? sweetLinkEnv.daemonUrl;
  const fallbackAdminKey =
    rawOptions.adminKey ?? config.adminKey ?? sweetLinkEnv.localAdminApiKey ?? sweetLinkEnv.adminApiKey ?? null;
  let optionOauthScriptPath: string | null = null;
  if (typeof rawOptions.oauthScript === 'string') {
    const trimmed = rawOptions.oauthScript.trim();
    if (trimmed.length > 0) {
      optionOauthScriptPath = resolveCliPath(trimmed);
    }
  }
  const fallbackOauthScriptPath =
    optionOauthScriptPath ??
    config.oauthScript ??
    (sweetLinkEnv.cliOauthScriptPath ? resolveCliPath(sweetLinkEnv.cliOauthScriptPath) : null);
  const optionLabel = normalizeAppLabel(rawOptions.appLabel);
  const fallbackAppLabel = formatAppLabel(config.appLabel ?? sweetLinkEnv.appLabel);
  const devBootstrap = config.devBootstrap
    ? {
        endpoint: config.devBootstrap.endpoint ?? null,
        loginPath: config.devBootstrap.loginPath ?? null,
        redirectParam: config.devBootstrap.redirectParam ?? null,
      }
    : null;

  const servers: ResolvedServerConfig[] = (config.servers ?? []).map((server) => ({
    env: server.env,
    start: server.start ?? null,
    check: server.check ?? null,
    cwd: server.cwd ?? null,
    timeoutMs: typeof server.timeoutMs === 'number' ? server.timeoutMs : null,
  }));

  return {
    appUrl: normalizeUrlOption(optionUrl, fallbackAppUrl),
    daemonUrl: normalizeUrlOption(rawOptions.daemonUrl, fallbackDaemonUrl),
    adminKey: normalizeAdminKey(fallbackAdminKey),
    devBootstrap,
    oauthScriptPath: fallbackOauthScriptPath,
    appLabel: optionLabel ?? fallbackAppLabel,
    servers,
  };
};

/** Extracts SweetLink CLI configuration (app/daemon URLs and admin key). */
export function resolveConfig(command: Command): CliConfig {
  const parent = command.parent ?? command;
  const options = readRootProgramOptions(parent);
  const serversByEnv: Record<string, ResolvedServerConfig> = {};
  for (const server of options.servers) {
    serversByEnv[server.env] = server;
  }
  return {
    appLabel: options.appLabel,
    adminApiKey: options.adminKey,
    devBootstrap: options.devBootstrap,
    appBaseUrl: options.appUrl,
    daemonBaseUrl: options.daemonUrl,
    oauthScriptPath: options.oauthScriptPath,
    servers: serversByEnv,
  };
}

interface ResolveAppUrlOptions {
  readonly optionUrl?: string;
  readonly optionPort: number | null;
  readonly configAppUrl?: string;
  readonly configPort: number | null;
}

const LOCAL_DEFAULT_URL = 'http://localhost:3000';

function resolveDefaultAppUrl({ optionUrl, optionPort, configAppUrl, configPort }: ResolveAppUrlOptions): string {
  if (optionUrl && optionUrl.trim().length > 0) {
    return optionUrl;
  }

  if (typeof optionPort === 'number') {
    return applyPortToUrl(configAppUrl ?? sweetLinkEnv.appUrl ?? LOCAL_DEFAULT_URL, optionPort);
  }

  if (configAppUrl) {
    return configAppUrl;
  }

  if (configPort) {
    return applyPortToUrl(sweetLinkEnv.appUrl ?? LOCAL_DEFAULT_URL, configPort);
  }

  return sweetLinkEnv.appUrl ?? LOCAL_DEFAULT_URL;
}

function applyPortToUrl(base: string, port: number): string {
  try {
    const url = new URL(base);
    url.port = String(port);
    return url.toString();
  } catch {
    return `http://localhost:${port}`;
  }
}

function normalizePort(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

const resolveCliPath = (candidate: string): string => {
  if (path.isAbsolute(candidate)) {
    return candidate;
  }
  return path.resolve(process.cwd(), candidate);
};
