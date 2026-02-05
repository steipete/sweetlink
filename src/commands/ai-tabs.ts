import type { Command } from 'commander';
import { readCommandOptions } from '../core/env.js';
import { connectToDevTools, loadDevToolsConfig } from '../runtime/devtools.js';

interface AiTabsListCommandOptions {
  json?: boolean;
}

interface AiTabsNewCommandOptions {
  url?: string;
}


/**
 * Registers the ai-tabs command group for tab management.
 */
export function registerAiTabsCommand(program: Command): void {
  const tabs = program
    .command('ai-tabs')
    .description('Manage browser tabs');

  // List tabs
  tabs
    .command('list')
    .description('List all open tabs')
    .option('--json', 'Output as JSON', false)
    .action(async function (this: Command) {
      const options = readCommandOptions<AiTabsListCommandOptions>(this);

      const config = await loadDevToolsConfig();
      if (!config) {
        throw new Error('No DevTools connection available. Run "sweetlink open --controlled" first.');
      }

      const { browser } = await connectToDevTools(config);
      const contexts = browser.contexts();
      const pages = contexts.flatMap((ctx) => ctx.pages());

      const tabInfo = pages.map((page, index) => ({
        index,
        url: page.url(),
        title: '',  // Title requires async call, keeping it simple
      }));

      if (options.json) {
        console.log(JSON.stringify(tabInfo, null, 2));
      } else if (tabInfo.length === 0) {
        console.log('No tabs open');
      } else {
        for (const tab of tabInfo) {
          console.log(`[${tab.index}] ${tab.url}`);
        }
      }
    });

  // Open new tab
  tabs
    .command('new')
    .description('Open a new tab')
    .option('-u, --url <url>', 'URL to open in new tab')
    .action(async function (this: Command) {
      const options = readCommandOptions<AiTabsNewCommandOptions>(this);

      const config = await loadDevToolsConfig();
      if (!config) {
        throw new Error('No DevTools connection available. Run "sweetlink open --controlled" first.');
      }

      const { browser } = await connectToDevTools(config);
      const contexts = browser.contexts();
      if (contexts.length === 0) {
        throw new Error('No browser context available');
      }

      const context = contexts[0];
      if (!context) {
        throw new Error('No browser context available');
      }
      const newPage = await context.newPage();

      if (options.url) {
        await newPage.goto(options.url);
        console.log(`✓ opened new tab with ${options.url}`);
      } else {
        console.log('✓ opened new blank tab');
      }
    });

  // Focus tab by index
  tabs
    .command('focus <index>')
    .description('Focus a tab by index')
    .action(async function (this: Command, indexStr: string) {
      const index = Number.parseInt(indexStr, 10);
      if (!Number.isFinite(index) || index < 0) {
        throw new Error('Index must be a non-negative integer');
      }

      const config = await loadDevToolsConfig();
      if (!config) {
        throw new Error('No DevTools connection available. Run "sweetlink open --controlled" first.');
      }

      const { browser } = await connectToDevTools(config);
      const contexts = browser.contexts();
      const pages = contexts.flatMap((ctx) => ctx.pages());

      if (index >= pages.length) {
        throw new Error(`Tab index ${index} out of range (${pages.length} tabs open)`);
      }

      const targetPage = pages[index];
      if (targetPage) {
        await targetPage.bringToFront();
        console.log(`✓ focused tab ${index}: ${targetPage.url()}`);
      }
    });

  // Close tab by index
  tabs
    .command('close [index]')
    .description('Close a tab by index (default: current tab)')
    .action(async function (this: Command, indexStr?: string) {
      const config = await loadDevToolsConfig();
      if (!config) {
        throw new Error('No DevTools connection available. Run "sweetlink open --controlled" first.');
      }

      const { browser, page } = await connectToDevTools(config);

      if (indexStr === undefined) {
        // Close current page
        await page.close();
        console.log('✓ closed current tab');
      } else {
        const index = Number.parseInt(indexStr, 10);
        if (!Number.isFinite(index) || index < 0) {
          throw new Error('Index must be a non-negative integer');
        }

        const contexts = browser.contexts();
        const pages = contexts.flatMap((ctx) => ctx.pages());

        if (index >= pages.length) {
          throw new Error(`Tab index ${index} out of range (${pages.length} tabs open)`);
        }

        const targetPage = pages[index];
        if (targetPage) {
          await targetPage.close();
          console.log(`✓ closed tab ${index}`);
        }
      }
    });
}
