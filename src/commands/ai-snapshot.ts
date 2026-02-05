import type { Command } from 'commander';
import { readCommandOptions } from '../core/env.js';
import { connectToDevTools, loadDevToolsConfig } from '../runtime/devtools.js';
import { fetchAccessibilityTree } from '../snapshot/accessibility.js';
import {
  formatSnapshot,
  formatSnapshotAria,
  type FormatOptions,
} from '../snapshot/formatter.js';
import { assignRefs, type RefAssignmentOptions } from '../snapshot/refs.js';

interface AiSnapshotCommandOptions {
  interactive?: boolean;
  depth?: number;
  compact?: boolean;
  format?: 'ai' | 'aria';
}

/**
 * Registers the ai-snapshot command for capturing AI-optimized page snapshots.
 *
 * Uses the browser's native accessibility tree via CDP to generate concise,
 * AI-readable snapshots with element refs for interaction.
 */
export function registerAiSnapshotCommand(program: Command): void {
  program
    .command('ai-snapshot')
    .description('Capture an AI-optimized accessibility snapshot of the page')
    .option('-i, --interactive', 'Only include interactive elements', false)
    .option('-d, --depth <n>', 'Maximum tree depth to traverse', Number, 50)
    .option('-c, --compact', 'Compact mode: skip empty names, reduce output', false)
    .option('-f, --format <format>', 'Output format: ai (default) or aria', 'ai')
    .action(async function (this: Command) {
      const options = readCommandOptions<AiSnapshotCommandOptions>(this);

      // Load DevTools config to connect to controlled Chrome
      const config = await loadDevToolsConfig();
      if (!config) {
        throw new Error(
          'No DevTools connection available. Run "sweetlink open --controlled" first.'
        );
      }

      // Connect to the browser
      const { page } = await connectToDevTools(config);

      // Fetch accessibility tree via CDP
      const tree = await fetchAccessibilityTree(page);

      // Assign refs to elements
      const refOptions: RefAssignmentOptions = {
        interactiveOnly: options.interactive === true,
        maxDepth: options.depth ?? 50,
      };
      const registry = assignRefs(tree, refOptions);

      // Format the snapshot
      const formatOptions: FormatOptions = {
        includeRefs: true,
        maxDepth: options.depth ?? 50,
        compact: options.compact === true,
      };

      const format = options.format ?? 'ai';
      const result =
        format === 'aria'
          ? formatSnapshotAria(registry, formatOptions)
          : formatSnapshot(registry, formatOptions);

      // Output the snapshot
      console.log(result.output);

      // Print stats summary
      console.log();
      console.log(
        `--- ${result.stats.elements} elements, ${result.stats.interactive} interactive, ${result.stats.lines} lines` +
          (result.truncated ? ' (truncated)' : '')
      );
    });
}
