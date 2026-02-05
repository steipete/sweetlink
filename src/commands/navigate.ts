import type { Command } from 'commander';
import { OpenClawClient } from '../openclaw/client.js';
import { resolveOpenClawConfig } from '../openclaw/config.js';

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

      const client = new OpenClawClient(ocConfig);
      const result = await client.navigate({ url });
      console.log(`Navigated to ${result.url}`);
    });
}
