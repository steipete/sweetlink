// ---------------------------------------------------------------------------
// Resolve OpenClaw configuration from file config → env vars → defaults
// ---------------------------------------------------------------------------
import { loadSweetLinkFileConfig } from '../core/config-file.js';
import { sweetLinkEnv } from '../env.js';
import { OPENCLAW_DEFAULTS } from './types.js';
export function resolveOpenClawConfig(fileOverride) {
    const file = fileOverride ?? loadSweetLinkFileConfig().config.openclaw;
    const url = file?.url ??
        sweetLinkEnv.openclawUrl ??
        OPENCLAW_DEFAULTS.url;
    const profile = file?.profile ??
        sweetLinkEnv.openclawProfile ??
        OPENCLAW_DEFAULTS.profile;
    const snapshotFormat = file?.snapshotFormat === 'ai' || file?.snapshotFormat === 'aria'
        ? file.snapshotFormat
        : OPENCLAW_DEFAULTS.snapshotFormat;
    const refs = file?.refs === 'role' || file?.refs === 'aria'
        ? file.refs
        : OPENCLAW_DEFAULTS.refs;
    const efficient = file?.efficient ?? OPENCLAW_DEFAULTS.efficient;
    const hasExplicitUrl = Boolean(file?.url ?? sweetLinkEnv.openclawUrl);
    const enabled = file?.enabled ?? (hasExplicitUrl || OPENCLAW_DEFAULTS.enabled);
    return { enabled, url, profile, snapshotFormat, refs, efficient };
}
//# sourceMappingURL=config.js.map