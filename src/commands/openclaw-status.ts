import type { Command } from 'commander';
import { OpenClawClient } from '../openclaw/client.js';
import { resolveOpenClawConfig } from '../openclaw/config.js';

export function registerOpenClawStatusCommand(program: Command): void {
  program
    .command('openclaw-status')
    .description('Check connectivity to the OpenClaw browser control server')
    .action(async function (this: Command) {
      const ocConfig = resolveOpenClawConfig();

      if (!ocConfig.enabled) {
        console.log('OpenClaw integration is not enabled.');
        console.log('To enable, add { "openclaw": { "enabled": true } } to sweetlink.json');
        console.log('or set SWEETLINK_OPENCLAW_URL.');
        return;
      }

      console.log(`OpenClaw server: ${ocConfig.url}`);
      console.log(`Profile: ${ocConfig.profile}`);

      const client = new OpenClawClient(ocConfig);
      try {
        const health = await client.health({ skipCache: true });
        console.log(`Running: ${health.running}`);
        console.log(`CDP ready: ${health.cdpReady}`);
        if (health.running && health.cdpReady) {
          console.log('OpenClaw is ready.');
        } else {
          console.log('OpenClaw is not fully ready. Check that the browser is launched.');
          process.exitCode = 1;
        }
      } catch (error) {
        console.error(
          'Failed to connect to OpenClaw:',
          error instanceof Error ? error.message : String(error),
        );
        console.log('Hint: ensure OpenClaw is running (`openclaw browser launch`).');
        process.exitCode = 1;
      }
    });
}
