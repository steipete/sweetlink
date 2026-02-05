import type { Command } from 'commander';
import { readCommandOptions } from '../core/env.js';
import { connectToDevTools, loadDevToolsConfig } from '../runtime/devtools.js';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

interface AiNavigateCommandOptions {
  wait?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  timeout?: number;
}

/**
 * Registers the ai-navigate command for browser navigation.
 */
export function registerAiNavigateCommand(program: Command): void {
  program
    .command('ai-navigate <url>')
    .description('Navigate the browser to a URL')
    .option('--wait <state>', 'Wait until: load, domcontentloaded, networkidle, commit', 'load')
    .option('--timeout <ms>', 'Navigation timeout in milliseconds', Number, 30_000)
    .action(async function (this: Command, url: string) {
      const options = readCommandOptions<AiNavigateCommandOptions>(this);

      // Validate URL
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error(`Invalid URL: ${url}`);
      }

      if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
        throw new Error(`Unsupported protocol: ${parsed.protocol}. Only http and https are allowed.`);
      }

      // Load DevTools config
      const config = await loadDevToolsConfig();
      if (!config) {
        throw new Error(
          'No DevTools connection available. Run "sweetlink open --controlled" first.'
        );
      }

      // Connect to browser
      const { page } = await connectToDevTools(config);

      // Navigate
      const timeout = options.timeout ?? 30_000;
      const waitUntil = options.wait ?? 'load';

      await page.goto(url, {
        timeout,
        waitUntil: waitUntil as 'load' | 'domcontentloaded' | 'networkidle' | 'commit',
      });

      console.log(`✓ navigated to ${url}`);
    });
}
