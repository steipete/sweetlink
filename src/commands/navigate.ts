import type { Command } from 'commander';
import { OpenClawClient } from '../openclaw/client.js';
import { resolveOpenClawConfig } from '../openclaw/config.js';

const ALLOWED_NAVIGATE_PROTOCOLS = new Set(['http:', 'https:']);

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
        console.error(`Invalid URL: ${url}`);
        process.exitCode = 1;
        return;
      }

      if (!ALLOWED_NAVIGATE_PROTOCOLS.has(parsed.protocol)) {
        console.error(`Unsupported protocol: ${parsed.protocol}. Only http: and https: are allowed.`);
        process.exitCode = 1;
        return;
      }

      const client = new OpenClawClient(ocConfig);
      try {
        const result = await client.navigate({ url: parsed.toString() });
        console.log(`Navigated to ${result.url}`);
      } catch (error) {
        console.error('Navigation failed:', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });
}
