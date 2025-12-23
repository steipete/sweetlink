import os from 'node:os';
import path from 'node:path';
import { SWEETLINK_DEFAULT_PORT } from './index.js';
function parsePort(raw) {
    const candidate = Number(raw);
    if (Number.isFinite(candidate) && candidate > 0) {
        return candidate;
    }
    return SWEETLINK_DEFAULT_PORT;
}
export function readSweetLinkEnv() {
    // biome-ignore lint/style/noProcessEnv: centralized SweetLink environment configuration
    const envVariables = process.env;
    const { SWEETLINK_APP_LABEL, SWEETLINK_APP_URL, SWEETLINK_DAEMON_URL, SWEETLINK_PROD_URL, SWEETLINK_PORT, SWEETLINK_SECRET, SWEETLINK_LOCAL_ADMIN_API_KEY, SWEETLINK_ADMIN_API_KEY, SWEETISTICS_LOCALHOST_API_KEY, SWEETISTICS_API_KEY, NODE_ENV, SWEETLINK_CA_PATH, SWEETLINK_CAROOT, SWEETLINK_CHROME_PATH, SWEETLINK_CHROME_PROFILE_PATH, SWEETLINK_CHROME_PROFILE, SWEETLINK_DEVTOOLS_URL, SWEETLINK_COOKIE_DEBUG, SWEETLINK_CLI_TEST, SWEETLINK_OAUTH_SCRIPT, } = envVariables;
    const normalizedLabel = SWEETLINK_APP_LABEL?.trim();
    return {
        appLabel: normalizedLabel && normalizedLabel.length > 0 ? normalizedLabel : 'your application',
        appUrl: SWEETLINK_APP_URL ?? 'http://localhost:3000',
        prodAppUrl: SWEETLINK_PROD_URL ?? SWEETLINK_APP_URL ?? 'http://localhost:3000',
        daemonUrl: SWEETLINK_DAEMON_URL ?? `https://localhost:${SWEETLINK_DEFAULT_PORT}`,
        port: parsePort(SWEETLINK_PORT),
        secret: SWEETLINK_SECRET ?? null,
        secretPath: envVariables.SWEETLINK_SECRET_PATH ?? path.join(os.homedir(), '.sweetlink', 'secret.key'),
        isProduction: NODE_ENV === 'production',
        localAdminApiKey: SWEETLINK_LOCAL_ADMIN_API_KEY ?? SWEETISTICS_LOCALHOST_API_KEY ?? null,
        adminApiKey: SWEETLINK_ADMIN_API_KEY ?? SWEETISTICS_API_KEY ?? null,
        cliCaPath: SWEETLINK_CA_PATH ?? null,
        cliCaRoot: SWEETLINK_CAROOT ?? path.join(os.homedir(), 'Library', 'Application Support', 'mkcert'),
        cliChromePath: SWEETLINK_CHROME_PATH ?? null,
        cliDevtoolsUrl: SWEETLINK_DEVTOOLS_URL?.trim() ?? null,
        cliChromeProfilePath: SWEETLINK_CHROME_PROFILE_PATH ?? SWEETLINK_CHROME_PROFILE ?? null,
        cliCookieDebug: SWEETLINK_COOKIE_DEBUG === '1',
        cliOauthScriptPath: SWEETLINK_OAUTH_SCRIPT?.trim() ?? null,
        debug: envVariables.SWEETLINK_DEBUG === '1',
        cliTestMode: SWEETLINK_CLI_TEST === '1',
    };
}
export const sweetLinkEnv = readSweetLinkEnv();
//# sourceMappingURL=env.js.map