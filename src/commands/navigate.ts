import type { Command } from 'commander';
import { OpenClawClient } from '../openclaw/client.js';
import { resolveOpenClawConfig } from '../openclaw/config.js';

const ALLOWED_NAVIGATE_PROTOCOLS = new Set(['http:', 'https:']);

/** Sanitize URL for error messages — removes credentials to prevent leakage. */
function sanitizeUrlForError(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    // If we can't parse it, truncate and indicate it's invalid
    const truncated = url.length > 100 ? `${url.slice(0, 100)}...` : url;
    return truncated;
  }
}

export function registerNavigateCommand(program: Command): void {
  program
    .command('navigate <url>')
    .description('Navigate the browser to a URL via OpenClaw')
    .action(async function (this: Command, url: string) {
      const ocConfig = resolveOpenClawConfig();

      if (!ocConfig.enabled) {
        console.error('OpenClaw integration is not enabled. Add { "openclaw": { "enabled": true } } to sweetlink.json.');
        process.exitCode = 1;
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        console.error(`Invalid URL: ${sanitizeUrlForError(url)}`);
        process.exitCode = 1;
        return;
      }

      if (!ALLOWED_NAVIGATE_PROTOCOLS.has(parsed.protocol)) {
        console.error(`Unsupported protocol: ${parsed.protocol}. Only http: and https: are allowed.`);
        process.exitCode = 1;
        return;
      }

      try {
        const client = new OpenClawClient(ocConfig);
        const result = await client.navigate({ url: parsed.toString() });
        console.log(`Navigated to ${result.url}`);
      } catch (error) {
        console.error('Navigation failed:', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });
}
