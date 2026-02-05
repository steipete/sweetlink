import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import { readCommandOptions } from '../core/env.js';
import { connectToDevTools, loadDevToolsConfig } from '../runtime/devtools.js';
import { fetchAccessibilityTree } from '../snapshot/accessibility.js';
import { assignRefs, resolveRefToSelector } from '../snapshot/refs.js';

const REF_FORMAT_PATTERN = /^[a-z]\d+$/i;

interface AiUploadCommandOptions {
  ref?: string;
  timeout?: number;
}

/**
 * Registers the ai-upload command for file uploads.
 *
 * Either clicks a file input by ref, or handles the next file chooser dialog.
 */
export function registerAiUploadCommand(program: Command): void {
  program
    .command('ai-upload <files...>')
    .description('Upload files to a file input or file chooser')
    .option('-r, --ref <ref>', 'File input element ref (optional, will wait for file chooser if not specified)')
    .option('--timeout <ms>', 'Timeout in milliseconds', Number, 30_000)
    .action(async function (this: Command, files: string[]) {
      const options = readCommandOptions<AiUploadCommandOptions>(this);

      // Validate and resolve file paths
      const resolvedFiles = files.map((file) => {
        const resolved = resolve(file);
        if (!existsSync(resolved)) {
          throw new Error(`File not found: ${file}`);
        }
        return resolved;
      });

      // Load DevTools config
      const config = await loadDevToolsConfig();
      if (!config) {
        throw new Error(
          'No DevTools connection available. Run "sweetlink open --controlled" first.'
        );
      }

      // Connect to browser
      const { page } = await connectToDevTools(config);
      const timeout = options.timeout ?? 30_000;

      if (options.ref) {
        // Upload to specific file input
        if (!REF_FORMAT_PATTERN.test(options.ref)) {
          throw new Error(`Invalid ref format: ${options.ref}. Expected format like e1, e42`);
        }

        const tree = await fetchAccessibilityTree(page);
        const registry = assignRefs(tree);

        const element = registry.refMap.get(options.ref);
        if (!element) {
          throw new Error(`Ref "${options.ref}" not found`);
        }

        const selector = await resolveRefToSelector(page, registry, options.ref);
        if (!selector) {
          throw new Error(`Could not resolve ref "${options.ref}" to a selector`);
        }

        await page.locator(selector).first().setInputFiles(resolvedFiles, { timeout });
        console.log(`✓ uploaded ${resolvedFiles.length} file(s) to [${options.ref}]`);
      } else {
        // Wait for file chooser and handle it
        console.log('Waiting for file chooser...');

        const fileChooserPromise = page.waitForEvent('filechooser', { timeout });
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(resolvedFiles);

        console.log(`✓ uploaded ${resolvedFiles.length} file(s) via file chooser`);
      }
    });
}
