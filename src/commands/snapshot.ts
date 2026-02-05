import type { Command } from 'commander';
import { readCommandOptions } from '../core/env.js';
import { OpenClawClient } from '../openclaw/client.js';
import { resolveOpenClawConfig } from '../openclaw/config.js';
import type { OpenClawSnapshotParams, OpenClawSnapshotResponse } from '../openclaw/types.js';

interface SnapshotCommandOptions {
  format?: string;
  efficient?: boolean;
  interactive?: boolean;
  labels?: boolean;
  compact?: boolean;
  depth?: number;
  maxChars?: number;
  selector?: string;
  frame?: string;
  refs?: string;
}

export function registerSnapshotCommand(program: Command): void {
  program
    .command('snapshot')
    .description('Capture an AI-optimized page snapshot via OpenClaw')
    .option('--format <format>', 'Snapshot format: ai (default) or aria', 'ai')
    .option('--efficient', 'Use efficient mode (compact, limited depth)', false)
    .option('--interactive', 'Only include interactive elements', false)
    .option('--labels', 'Overlay numbered labels on interactive elements (requires format=ai)', false)
    .option('--compact', 'Remove empty/unnamed structural elements', false)
    .option('--depth <n>', 'Max tree depth', Number)
    .option('--max-chars <n>', 'Truncate output at N characters', Number)
    .option('--selector <css>', 'CSS selector for subtree')
    .option('--frame <selector>', 'Frame/iframe selector')
    .option('--refs <mode>', 'Ref generation mode: role (default) or aria')
    .action(async function (this: Command) {
      const options = readCommandOptions<SnapshotCommandOptions>(this);
      const ocConfig = resolveOpenClawConfig();

      if (!ocConfig.enabled) {
        console.error('OpenClaw integration is not enabled. Add { "openclaw": { "enabled": true } } to sweetlink.json.');
        process.exitCode = 1;
        return;
      }

      const client = new OpenClawClient(ocConfig);
      const ready = await client.isReady();
      if (!ready) {
        console.error('OpenClaw is not ready. Run `sweetlink openclaw-status` for details.');
        process.exitCode = 1;
        return;
      }

      const format = options.format === 'aria' ? 'aria' : 'ai';
      const refs = options.refs === 'aria' ? 'aria' : ocConfig.refs;

      const params: OpenClawSnapshotParams = {
        format,
        refs,
        ...(options.efficient || ocConfig.efficient ? { mode: 'efficient' as const } : {}),
        ...(options.interactive ? { interactive: true } : {}),
        ...(options.labels ? { labels: true } : {}),
        ...(options.compact ? { compact: true } : {}),
        ...(options.depth !== undefined ? { depth: options.depth } : {}),
        ...(options.maxChars !== undefined ? { maxChars: options.maxChars } : {}),
        ...(options.selector ? { selector: options.selector } : {}),
        ...(options.frame ? { frame: options.frame } : {}),
      };

      const result: OpenClawSnapshotResponse = await client.snapshot(params);

      if (result.format === 'ai') {
        console.log(result.snapshot);
        if (result.truncated) {
          console.warn('(output truncated)');
        }
        if (result.stats) {
          const s = result.stats;
          console.error(`[${s.lines} lines, ${s.chars} chars, ${s.refs} refs, ${s.interactive} interactive]`);
        }
        if (result.imagePath) {
          console.error(`Labels image: ${result.imagePath}`);
        }
      } else {
        for (const node of result.nodes) {
          const indent = '  '.repeat(node.depth);
          const parts = [`${indent}${node.role}`];
          if (node.name) parts.push(`"${node.name}"`);
          if (node.ref) parts.push(`[${node.ref}]`);
          if (node.value) parts.push(`value="${node.value}"`);
          console.log(parts.join(' '));
        }
      }
    });
}
