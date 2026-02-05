import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import { readCommandOptions } from '../core/env.js';
import { connectToDevTools, loadDevToolsConfig } from '../runtime/devtools.js';

interface AiPdfCommandOptions {
  output?: string;
  format?: string;
  landscape?: boolean;
  printBackground?: boolean;
  scale?: number;
  margin?: string;
}

/**
 * Registers the ai-pdf command for generating PDFs.
 */
export function registerAiPdfCommand(program: Command): void {
  program
    .command('ai-pdf')
    .description('Generate a PDF of the current page')
    .option('-o, --output <path>', 'Output file path (default: page.pdf)')
    .option('--format <format>', 'Paper format: Letter, Legal, A4, etc.', 'Letter')
    .option('--landscape', 'Use landscape orientation', false)
    .option('--print-background', 'Print background graphics', true)
    .option('--scale <n>', 'Scale factor (0.1 to 2.0)', Number, 1)
    .option('--margin <size>', 'Margin size (e.g., "1cm", "0.5in")', '0.5in')
    .action(async function (this: Command) {
      const options = readCommandOptions<AiPdfCommandOptions>(this);

      // Load DevTools config
      const config = await loadDevToolsConfig();
      if (!config) {
        throw new Error(
          'No DevTools connection available. Run "sweetlink open --controlled" first.'
        );
      }

      // Connect to browser
      const { page } = await connectToDevTools(config);

      // Validate scale
      const scale = options.scale ?? 1;
      if (scale < 0.1 || scale > 2) {
        throw new Error('Scale must be between 0.1 and 2.0');
      }

      // Generate PDF
      const margin = options.margin ?? '0.5in';
      const pdfBuffer = await page.pdf({
        format: options.format ?? 'Letter',
        landscape: options.landscape ?? false,
        printBackground: options.printBackground !== false,
        scale,
        margin: {
          top: margin,
          bottom: margin,
          left: margin,
          right: margin,
        },
      });

      // Write to file
      const outputPath = resolve(options.output ?? 'page.pdf');
      await writeFile(outputPath, pdfBuffer);

      console.log(`✓ PDF saved to ${outputPath} (${pdfBuffer.length} bytes)`);
    });
}
