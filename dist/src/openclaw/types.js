// ---------------------------------------------------------------------------
// OpenClaw browser-control server types
// ---------------------------------------------------------------------------
/** Defaults applied when values are missing from config / env. */
export const OPENCLAW_DEFAULTS = {
    enabled: false,
    url: 'http://127.0.0.1:18791',
    profile: 'openclaw',
    snapshotFormat: 'ai',
    refs: 'role',
    efficient: false,
};
// -- Errors -------------------------------------------------------------------
export class OpenClawError extends Error {
    statusCode;
    upstream;
    constructor(message, statusCode, upstream) {
        super(message);
        this.name = 'OpenClawError';
        this.statusCode = statusCode;
        this.upstream = upstream;
    }
}
//# sourceMappingURL=types.js.map