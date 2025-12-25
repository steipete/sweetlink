import { SWEETLINK_CLI_EXP_SECONDS, signSweetLinkToken } from '../shared/src/index.js';
import { resolveSweetLinkSecret } from '../shared/src/node.js';
import { loadDevBootstrap } from './core/dev-bootstrap.js';
import { fetchJson } from './http.js';
import { describeAppForPrompt } from './util/app-label.js';
import { describeUnknown } from './util/errors.js';
import { TRAILING_SLASH_PATTERN } from './util/regex.js';
let cachedCliToken = null;
export function resetCliTokenCache() {
    cachedCliToken = null;
}
export async function fetchCliToken(config) {
    const now = Math.floor(Date.now() / 1000);
    if (cachedCliToken && cachedCliToken.expiresAt - 30 > now) {
        return cachedCliToken.token;
    }
    const bootstrap = await loadDevBootstrap(config).catch(() => null);
    const adminApiKey = config.adminApiKey ?? bootstrap?.adminApiKey ?? null;
    if (adminApiKey) {
        try {
            const response = await fetchJson(`${config.appBaseUrl.replace(TRAILING_SLASH_PATTERN, '')}/api/admin/sweetlink/cli-token`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${adminApiKey}`,
                    'Content-Type': 'application/json',
                },
            });
            cachedCliToken = {
                token: response.accessToken,
                expiresAt: response.expiresAt,
                source: 'api',
            };
            return response.accessToken;
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            console.warn('[SweetLink CLI] Falling back to local secret after CLI token request failed:', detail);
        }
    }
    try {
        const secretResolution = await resolveSweetLinkSecret();
        const token = signSweetLinkToken({
            secret: secretResolution.secret,
            scope: 'cli',
            subject: 'local-cli',
            ttlSeconds: SWEETLINK_CLI_EXP_SECONDS,
        });
        const expiresAt = Math.floor(Date.now() / 1000) + SWEETLINK_CLI_EXP_SECONDS;
        cachedCliToken = { token, expiresAt, source: 'secret' };
        return token;
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : describeUnknown(error);
        const targetDescription = describeAppForPrompt(config.appLabel);
        const hint = adminApiKey
            ? `Check that your admin key is valid or ensure ${targetDescription} is running.`
            : 'Provide --admin-key or start the SweetLink daemon once (pnpm sweetlink) to generate the shared secret.';
        throw new Error(`Unable to resolve SweetLink CLI token. Reason: ${detail}. ${hint}`);
    }
}
//# sourceMappingURL=token.js.map