import { resolveSocketUrl } from './handshake.js';
export function buildContentSecurityPolicy(daemonUrl) {
    const socketOrigin = new URL(resolveSocketUrl(daemonUrl)).origin;
    return `default-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; connect-src 'self' ${socketOrigin}`;
}
