// ---------------------------------------------------------------------------
// Resolve OpenClaw configuration from file config → env vars → defaults
// ---------------------------------------------------------------------------

import type { SweetLinkOpenClawFileConfig } from '../core/config-file.js';
import { loadSweetLinkFileConfig } from '../core/config-file.js';
import { sweetLinkEnv } from '../env.js';
import { type OpenClawConfig, OPENCLAW_DEFAULTS } from './types.js';

export function resolveOpenClawConfig(fileOverride?: SweetLinkOpenClawFileConfig): OpenClawConfig {
  const file = fileOverride ?? loadSweetLinkFileConfig().config.openclaw;

  const url =
    file?.url ??
    sweetLinkEnv.openclawUrl ??
    OPENCLAW_DEFAULTS.url;

  const profile =
    file?.profile ??
    sweetLinkEnv.openclawProfile ??
    OPENCLAW_DEFAULTS.profile;

  const snapshotFormat =
    file?.snapshotFormat === 'ai' || file?.snapshotFormat === 'aria'
      ? file.snapshotFormat
      : OPENCLAW_DEFAULTS.snapshotFormat;

  const refs =
    file?.refs === 'role' || file?.refs === 'aria'
      ? file.refs
      : OPENCLAW_DEFAULTS.refs;

  const efficient = file?.efficient ?? OPENCLAW_DEFAULTS.efficient;

  const enabled = file?.enabled ?? OPENCLAW_DEFAULTS.enabled;

  return { enabled, url, profile, snapshotFormat, refs, efficient };
}
