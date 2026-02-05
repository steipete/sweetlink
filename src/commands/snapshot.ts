import type { Command } from 'commander';
import { readCommandOptions } from '../core/env.js';
import { OpenClawClient } from '../openclaw/client.js';
import { resolveOpenClawConfig } from '../openclaw/config.js';
import type {
  OpenClawConfig,
  OpenClawSnapshotAiResponse,
  OpenClawSnapshotAriaResponse,
  OpenClawSnapshotParams,
} from '../openclaw/types.js';

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

      const params = buildSnapshotParams(options, ocConfig);

      try {
        const client = new OpenClawClient(ocConfig);
        const ready = await client.isReady();
        if (!ready) {
          console.error('OpenClaw is not ready. Run `sweetlink openclaw-status` for details.');
          process.exitCode = 1;
          return;
        }

        const result = await client.snapshot(params);

        if (result.format === 'ai') {
          renderAiSnapshot(result);
        } else {
          renderAriaSnapshot(result);
        }
      } catch (error) {
        console.error('Snapshot failed:', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });
}

const MAX_DEPTH = 100; // Reasonable max DOM traversal depth
const MAX_CHARS = 10_000_000; // 10MB max output
const MAX_SELECTOR_LENGTH = 10_000; // 10KB max for CSS selectors

/** Validates a positive integer within safe bounds. Returns undefined if invalid. */
function safePositiveInt(value: number | undefined, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0 || value > max) return undefined;
  return Math.floor(value);
}

/** Validates string length. Returns undefined if missing or exceeds max. */
function validateStringLength(value: string | undefined, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (value.length > max) return undefined;
  return value;
}

function buildSnapshotParams(options: SnapshotCommandOptions, ocConfig: OpenClawConfig): OpenClawSnapshotParams {
  const format = options.format === 'aria' ? 'aria' : 'ai';
  const refs = options.refs === 'aria' ? 'aria' : ocConfig.refs;
  const depth = safePositiveInt(options.depth, MAX_DEPTH);
  const maxChars = safePositiveInt(options.maxChars, MAX_CHARS);
  const selector = validateStringLength(options.selector, MAX_SELECTOR_LENGTH);
  const frame = validateStringLength(options.frame, MAX_SELECTOR_LENGTH);

  return {
    format,
    refs,
    ...(options.efficient || ocConfig.efficient ? { mode: 'efficient' as const } : {}),
    ...(options.interactive ? { interactive: true } : {}),
    ...(options.labels ? { labels: true } : {}),
    ...(options.compact ? { compact: true } : {}),
    ...(depth !== undefined ? { depth } : {}),
    ...(maxChars !== undefined ? { maxChars } : {}),
    ...(selector ? { selector } : {}),
    ...(frame ? { frame } : {}),
  };
}

function renderAiSnapshot(result: OpenClawSnapshotAiResponse): void {
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
}

function renderAriaSnapshot(result: OpenClawSnapshotAriaResponse): void {
  for (const node of result.nodes) {
    const indent = '  '.repeat(node.depth);
    const parts = [`${indent}${node.role}`];
    if (node.name) parts.push(`"${node.name}"`);
    if (node.ref) parts.push(`[${node.ref}]`);
    if (node.value) parts.push(`value="${node.value}"`);
    console.log(parts.join(' '));
  }
}
