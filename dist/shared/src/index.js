import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
export const SWEETLINK_DEFAULT_PORT = 4455;
export const SWEETLINK_WS_PATH = '/bridge';
export const SWEETLINK_SESSION_EXP_SECONDS = 60 * 5; // 5 minutes
export const SWEETLINK_CLI_EXP_SECONDS = 60 * 60; // 1 hour
export const SWEETLINK_HEARTBEAT_INTERVAL_MS = 15_000;
export const SWEETLINK_HEARTBEAT_TOLERANCE_MS = 45_000;
export function signSweetLinkToken({ secret, scope, subject, ttlSeconds, sessionId }) {
    // We encode the payload ourselves (instead of relying on a JWT lib) so both daemon and browser
    // can verify tokens without pulling in heavyweight dependencies.
    if (!secret) {
        throw new Error('SweetLink secret is not configured');
    }
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = {
        tokenId: randomUUID(),
        scope,
        sub: subject,
        sessionId,
        issuedAt,
        expiresAt: issuedAt + ttlSeconds,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = signEncodedPayload(secret, encodedPayload);
    return `${encodedPayload}.${signature}`;
}
export function verifySweetLinkToken({ secret, token, expectedScope }) {
    if (!secret) {
        throw new Error('SweetLink secret is not configured');
    }
    const [encodedPayload, providedSignature] = token.split('.', 2);
    if (!(encodedPayload && providedSignature)) {
        throw new Error('Malformed SweetLink token');
    }
    const expectedSignature = signEncodedPayload(secret, encodedPayload);
    if (!timingSafeCompare(Buffer.from(providedSignature, 'base64url'), Buffer.from(expectedSignature, 'base64url'))) {
        throw new Error('Invalid SweetLink token signature');
    }
    const decoded = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object') {
        throw new Error('Invalid SweetLink token payload');
    }
    const now = Math.floor(Date.now() / 1000);
    if (decoded.expiresAt < now) {
        throw new Error('SweetLink token expired');
    }
    if (expectedScope && decoded.scope !== expectedScope) {
        throw new Error('SweetLink token scope mismatch');
    }
    return decoded;
}
function signEncodedPayload(secret, encodedPayload) {
    return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}
function timingSafeCompare(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    try {
        // timingSafeEqual throws if lengths mismatch; handle that here so callers only see false.
        return timingSafeEqual(a, b);
    }
    catch {
        return false;
    }
}
export function createSweetLinkSessionId() {
    return randomUUID();
}
export function createSweetLinkCommandId() {
    return randomUUID();
}
//# sourceMappingURL=index.js.map