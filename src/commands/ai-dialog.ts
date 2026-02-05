import type { Command } from 'commander';
import { readCommandOptions } from '../core/env.js';
import { connectToDevTools, loadDevToolsConfig } from '../runtime/devtools.js';

interface AiDialogCommandOptions {
  accept?: boolean;
  dismiss?: boolean;
  text?: string;
}

/**
 * Registers the ai-dialog command for handling browser dialogs.
 *
 * Sets up a handler for the next dialog (alert, confirm, prompt).
 */
export function registerAiDialogCommand(program: Command): void {
  program
    .command('ai-dialog')
    .description('Handle the next browser dialog (alert, confirm, prompt)')
    .option('--accept', 'Accept the dialog', false)
    .option('--dismiss', 'Dismiss the dialog', false)
    .option('--text <text>', 'Text to enter for prompt dialogs')
    .action(async function (this: Command) {
      const options = readCommandOptions<AiDialogCommandOptions>(this);

      // Validate options
      if (options.accept && options.dismiss) {
        throw new Error('Cannot use both --accept and --dismiss');
      }
      if (!(options.accept || options.dismiss)) {
        throw new Error('Must specify either --accept or --dismiss');
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

      // Set up dialog handler for next dialog
      const dialogPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          page.removeListener('dialog', handler);
          reject(new Error('No dialog appeared within 30 seconds'));
        }, 30_000);

        const handler = async (dialog: { type: () => string; message: () => string; accept: (text?: string) => Promise<void>; dismiss: () => Promise<void> }) => {
          clearTimeout(timeout);
          try {
            if (options.accept) {
              await dialog.accept(options.text);
              console.log(`✓ accepted ${dialog.type()} dialog: "${dialog.message()}"`);
            } else {
              await dialog.dismiss();
              console.log(`✓ dismissed ${dialog.type()} dialog: "${dialog.message()}"`);
            }
            resolve();
          } catch (error) {
            reject(error);
          }
        };

        page.once('dialog', handler);
      });

      console.log('Waiting for dialog...');
      await dialogPromise;
    });
}
