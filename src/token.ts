import { SWEETLINK_CLI_EXP_SECONDS, signSweetLinkToken } from '@sweetlink/shared';
import { resolveSweetLinkSecret, type SweetLinkSecretResolution } from '@sweetlink/shared/node';
import { fetchJson } from './http';
import type { CachedCliTokenSource, CliConfig } from './types';
import { describeAppForPrompt } from './util/app-label';
import { describeUnknown } from './util/errors';

interface CachedCliToken {
  readonly token: string;
  readonly expiresAt: number;
  readonly source: CachedCliTokenSource;
}

let cachedCliToken: CachedCliToken | null = null;

export function resetCliTokenCache(): void {
  cachedCliToken = null;
}

export async function fetchCliToken(config: CliConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedCliToken && cachedCliToken.expiresAt - 30 > now) {
    return cachedCliToken.token;
  }

  if (config.adminApiKey) {
    try {
      const response = await fetchJson<{ accessToken: string; expiresAt: number }>(
        `${config.appBaseUrl.replace(/\/$/, '')}/api/admin/sweetlink/cli-token`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.adminApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      cachedCliToken = {
        token: response.accessToken,
        expiresAt: response.expiresAt,
        source: 'api',
      };
      return response.accessToken;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn('[SweetLink CLI] Falling back to local secret after CLI token request failed:', detail);
    }
  }

  try {
    const secretResolution: SweetLinkSecretResolution = await resolveSweetLinkSecret();
    const token = signSweetLinkToken({
      secret: secretResolution.secret,
      scope: 'cli',
      subject: 'local-cli',
      ttlSeconds: SWEETLINK_CLI_EXP_SECONDS,
    });
    const expiresAt = Math.floor(Date.now() / 1000) + SWEETLINK_CLI_EXP_SECONDS;
    cachedCliToken = { token, expiresAt, source: 'secret' };
    return token;
  } catch (error) {
    const detail = error instanceof Error ? error.message : describeUnknown(error);
    const targetDescription = describeAppForPrompt(config.appLabel);
    const hint = config.adminApiKey
      ? `Check that your admin key is valid or ensure ${targetDescription} is running.`
      : 'Provide --admin-key or start the SweetLink daemon once (pnpm sweetlink) to generate the shared secret.';
    throw new Error(`Unable to resolve SweetLink CLI token. Reason: ${detail}. ${hint}`);
  }
}
