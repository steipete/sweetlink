import { fetchJson } from '../../http.js';
import type { CliConfig } from '../../types.js';
import { logDebugError } from '../../util/errors.js';
import { delay } from '../../util/time.js';
import { saveDevToolsConfig } from '../devtools.js';
import { urlsRoughlyMatch } from '../url.js';
import { OPTIONAL_TRAILING_SLASH_PATTERN } from '../util/regex.js';


export async function signalSweetLinkBootstrap(devtoolsUrl: string, targetUrl: string): Promise<void> {
  try {
    const payload = { devtoolsUrl, targetUrl };
    await fetch(`${devtoolsUrl.replace(OPTIONAL_TRAILING_SLASH_PATTERN, '')}/json/version`, { method: 'GET' });
    await fetch(`${targetUrl}/sweetlink/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    logDebugError('Failed to signal SweetLink bootstrap', error);
  }
}

export async function waitForSweetLinkSession(params: {
  config: CliConfig;
  token: string | null;
  targetUrl: string;
  timeoutSeconds: number;
  devtoolsUrl?: string;
}): Promise<{ sessionId: string; url: string } | null> {
  if (!params.token) {
    return null;
  }

  const deadline = Date.now() + params.timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: polling for sessions must be sequential.
      const response = await fetchJson<{ sessions: Array<{ sessionId: string; url: string }> }>(
        `${params.config.daemonBaseUrl}/sessions`,
        {
          headers: { Authorization: `Bearer ${params.token}` },
        }
      );
      const match = response.sessions.find((session) => urlsRoughlyMatch(session.url, params.targetUrl));
      if (match) {
        if (params.devtoolsUrl) {
          await saveDevToolsConfig({ devtoolsUrl: params.devtoolsUrl, sessionId: match.sessionId });
        }
        return match;
      }
    } catch {
      /* ignore transient fetch errors */
    }
    await delay(500);
  }
  return null;
}
