import { createHmac, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const SWEETLINK_SESSION_EXP_SECONDS = 60 * 5;
const SWEETLINK_WS_PATH = '/bridge';
const DEFAULT_SECRET_PATH = path.join(os.homedir(), '.sweetlink', 'secret.key');
const DEFAULT_DAEMON_PORT = 4455;
export function resolveDaemonUrl() {
    const daemonUrl = readEnvString('SWEETLINK_DAEMON_URL');
    if (daemonUrl) {
        return daemonUrl;
    }
    const port = Number(readEnvString('SWEETLINK_PORT') ?? String(DEFAULT_DAEMON_PORT));
    const safePort = Number.isFinite(port) && port > 0 ? port : DEFAULT_DAEMON_PORT;
    return `https://localhost:${safePort}`;
}
export function resolveSocketUrl(daemonUrl) {
    const socketUrl = new URL(daemonUrl);
    if (socketUrl.protocol === 'https:') {
        socketUrl.protocol = 'wss:';
    }
    else if (socketUrl.protocol === 'http:') {
        socketUrl.protocol = 'ws:';
    }
    else if (socketUrl.protocol !== 'ws:' && socketUrl.protocol !== 'wss:') {
        throw new Error(`Unsupported SweetLink daemon protocol: ${socketUrl.protocol}`);
    }
    socketUrl.pathname = SWEETLINK_WS_PATH;
    socketUrl.search = '';
    socketUrl.hash = '';
    return socketUrl.toString();
}
function signSweetLinkToken(options) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = {
        tokenId: randomUUID(),
        scope: 'session',
        sub: options.subject,
        sessionId: options.sessionId,
        issuedAt,
        expiresAt: issuedAt + options.ttlSeconds,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = createHmac('sha256', options.secret).update(encodedPayload).digest('base64url');
    return `${encodedPayload}.${signature}`;
}
export async function issueSweetLinkHandshake() {
    const secretResolution = await resolveSweetLinkSecret();
    const sessionId = randomUUID();
    const sessionToken = signSweetLinkToken({
        secret: secretResolution.secret,
        subject: 'sweetlink-example',
        ttlSeconds: SWEETLINK_SESSION_EXP_SECONDS,
        sessionId,
    });
    const expiresAt = Math.floor(Date.now() / 1000) + SWEETLINK_SESSION_EXP_SECONDS;
    const socketUrl = resolveSocketUrl(resolveDaemonUrl());
    return {
        sessionId,
        sessionToken,
        socketUrl,
        expiresAt,
        secretSource: secretResolution.source,
    };
}
async function resolveSweetLinkSecret() {
    const envSecret = readEnvString('SWEETLINK_SECRET');
    if (envSecret && envSecret.length >= 32) {
        return { secret: envSecret, source: 'env' };
    }
    const secretPath = readEnvString('SWEETLINK_SECRET_PATH') ?? DEFAULT_SECRET_PATH;
    try {
        const contents = await readFile(secretPath, 'utf8');
        const trimmed = contents.trim();
        if (trimmed.length >= 32) {
            return { secret: trimmed, source: 'file', path: secretPath };
        }
    }
    catch (error) {
        if (typeof error === 'object' && error && 'code' in error && error.code !== 'ENOENT') {
            // eslint-disable-next-line no-console -- provide diagnostics for the demo operator
            console.warn('Unable to read SweetLink secret, generating a new one.', error);
        }
    }
    const generated = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
    const secretDirectory = path.dirname(secretPath);
    await mkdir(secretDirectory, { recursive: true });
    await writeFile(secretPath, `${generated}\n`, { mode: fsConstants.S_IRUSR | fsConstants.S_IWUSR });
    return { secret: generated, source: 'generated', path: secretPath };
}
function readEnvString(key) {
    // biome-ignore lint/style/noProcessEnv: demo app reads raw env for configurability
    const raw = process.env[key];
    if (typeof raw !== 'string') {
        return null;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
}
