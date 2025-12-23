import path from 'node:path';
import { sweetLinkEnv } from '../env.js';
import { formatAppLabel, normalizeAppLabel } from '../util/app-label.js';
import { loadSweetLinkFileConfig } from './config-file.js';
import { readCommandOptions } from './env.js';
const normalizeUrlOption = (value, fallback) => {
    if (typeof value === 'string' && value.trim().length > 0) {
        return value;
    }
    return fallback;
};
const normalizeAdminKey = (value) => {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    return null;
};
/** Reads the root program options, falling back to defaults when values are missing. */
export const readRootProgramOptions = (command) => {
    const rawOptions = readCommandOptions(command);
    const { config } = loadSweetLinkFileConfig();
    let optionUrl;
    if (typeof rawOptions.appUrl === 'string') {
        optionUrl = rawOptions.appUrl;
    }
    else if (typeof rawOptions.url === 'string') {
        optionUrl = rawOptions.url;
    }
    else {
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
    const fallbackAdminKey = rawOptions.adminKey ?? config.adminKey ?? sweetLinkEnv.localAdminApiKey ?? sweetLinkEnv.adminApiKey ?? null;
    let optionOauthScriptPath = null;
    if (typeof rawOptions.oauthScript === 'string') {
        const trimmed = rawOptions.oauthScript.trim();
        if (trimmed.length > 0) {
            optionOauthScriptPath = resolveCliPath(trimmed);
        }
    }
    const fallbackOauthScriptPath = optionOauthScriptPath ??
        config.oauthScript ??
        (sweetLinkEnv.cliOauthScriptPath ? resolveCliPath(sweetLinkEnv.cliOauthScriptPath) : null);
    const optionLabel = normalizeAppLabel(rawOptions.appLabel);
    const fallbackAppLabel = formatAppLabel(config.appLabel ?? sweetLinkEnv.appLabel);
    const servers = (config.servers ?? []).map((server) => ({
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
        oauthScriptPath: fallbackOauthScriptPath,
        appLabel: optionLabel ?? fallbackAppLabel,
        servers,
    };
};
/** Extracts SweetLink CLI configuration (app/daemon URLs and admin key). */
export function resolveConfig(command) {
    const parent = command.parent ?? command;
    const options = readRootProgramOptions(parent);
    const serversByEnv = {};
    for (const server of options.servers) {
        serversByEnv[server.env] = server;
    }
    return {
        appLabel: options.appLabel,
        adminApiKey: options.adminKey,
        appBaseUrl: options.appUrl,
        daemonBaseUrl: options.daemonUrl,
        oauthScriptPath: options.oauthScriptPath,
        servers: serversByEnv,
    };
}
const LOCAL_DEFAULT_URL = 'http://localhost:3000';
function resolveDefaultAppUrl({ optionUrl, optionPort, configAppUrl, configPort }) {
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
function applyPortToUrl(base, port) {
    try {
        const url = new URL(base);
        url.port = String(port);
        return url.toString();
    }
    catch {
        return `http://localhost:${port}`;
    }
}
function normalizePort(value) {
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
const resolveCliPath = (candidate) => {
    if (path.isAbsolute(candidate)) {
        return candidate;
    }
    return path.resolve(process.cwd(), candidate);
};
//# sourceMappingURL=config.js.map