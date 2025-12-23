import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sweetLinkDebug } from '../../env.js';
import { isErrnoException } from '../../util/errors.js';
import { DEVTOOLS_CONFIG_PATH, DEVTOOLS_STATE_PATH } from './constants.js';
export async function loadDevToolsConfig() {
    try {
        const raw = await readFile(DEVTOOLS_CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed.devtoolsUrl) {
            return null;
        }
        return parsed;
    }
    catch (error) {
        if (sweetLinkDebug && (!isErrnoException(error) || error.code !== 'ENOENT')) {
            console.warn('Failed to read DevTools config:', error);
        }
        return null;
    }
}
export async function saveDevToolsConfig(patch) {
    const existing = await loadDevToolsConfig();
    const next = {
        devtoolsUrl: patch.devtoolsUrl,
        port: ensureConfigField(patch.port ?? existing?.port, 'DevTools port is required'),
        userDataDir: ensureConfigField(patch.userDataDir ?? existing?.userDataDir, 'DevTools userDataDir is required'),
        updatedAt: patch.updatedAt ?? existing?.updatedAt ?? Date.now(),
        targetUrl: patch.targetUrl ?? existing?.targetUrl,
        sessionId: patch.sessionId ?? existing?.sessionId,
        viewport: patch.viewport ?? existing?.viewport,
    };
    const configDirectory = path.dirname(DEVTOOLS_CONFIG_PATH);
    await mkdir(configDirectory, { recursive: true });
    await writeFile(DEVTOOLS_CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
}
export async function loadDevToolsState() {
    try {
        const raw = await readFile(DEVTOOLS_STATE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed.console)
            parsed.console = [];
        if (!parsed.network)
            parsed.network = [];
        return parsed;
    }
    catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
            return null;
        }
        console.warn('Failed to read DevTools state:', error);
        return null;
    }
}
export async function saveDevToolsState(state) {
    state.updatedAt = Date.now();
    const stateDirectory = path.dirname(DEVTOOLS_STATE_PATH);
    await mkdir(stateDirectory, { recursive: true });
    await writeFile(DEVTOOLS_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}
export function deriveDevtoolsLinkInfo(config, state) {
    const sessionIds = new Set();
    if (config?.sessionId) {
        sessionIds.add(config.sessionId);
    }
    if (state?.sessionId) {
        sessionIds.add(state.sessionId);
    }
    const endpoint = config?.devtoolsUrl ?? state?.endpoint ?? null;
    return { endpoint, sessionIds };
}
function ensureConfigField(value, message) {
    if (value === undefined || value === null) {
        throw new Error(message);
    }
    return value;
}
//# sourceMappingURL=config.js.map