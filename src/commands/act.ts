import type { Command } from 'commander';
import { readCommandOptions } from '../core/env.js';
import { OpenClawClient } from '../openclaw/client.js';
import { resolveOpenClawConfig } from '../openclaw/config.js';
import type { OpenClawAction } from '../openclaw/types.js';

const VALID_BUTTONS = new Set(['left', 'right', 'middle']);
const MAX_DIMENSION = 32_767; // Reasonable upper bound for viewport dimensions
const MAX_TIMEOUT_MS = 300_000; // 5 minutes max timeout
const MAX_TEXT_LENGTH = 1_000_000; // 1MB max for text input
const MAX_FN_LENGTH = 100_000; // 100KB max for JavaScript code
const MAX_VALUE_LENGTH = 10_000; // 10KB max per select value

/** Validates a positive integer within safe bounds. Returns undefined if invalid. */
function safePositiveInt(value: number | undefined, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0 || value > max) return undefined;
  return Math.floor(value);
}

/** Validates string length. Returns null if exceeds max. */
function validateStringLength(value: string | undefined, max: number): string | null {
  if (value === undefined) return null;
  if (value.length > max) return null;
  return value;
}

interface ActCommandOptions {
  kind: string;
  ref?: string;
  text?: string;
  key?: string;
  submit?: boolean;
  slowly?: boolean;
  doubleClick?: boolean;
  button?: string;
  startRef?: string;
  endRef?: string;
  values?: string[];
  width?: number;
  height?: number;
  fn?: string;
  timeout?: number;
}

export function registerActCommand(program: Command): void {
  program
    .command('act')
    .description('Perform a browser action via OpenClaw using ref IDs from a snapshot')
    .requiredOption('--kind <kind>', 'Action kind: click, type, press, hover, drag, select, resize, wait, evaluate, close')
    .option('--ref <ref>', 'Element ref ID (from snapshot)')
    .option('--text <text>', 'Text to type (for kind=type)')
    .option('--key <key>', 'Key name (for kind=press)')
    .option('--submit', 'Press Enter after typing (for kind=type)', false)
    .option('--slowly', 'Type one character at a time (for kind=type)', false)
    .option('--double-click', 'Double-click (for kind=click)', false)
    .option('--button <button>', 'Mouse button: left, right, middle (for kind=click)')
    .option('--start-ref <ref>', 'Drag start ref (for kind=drag)')
    .option('--end-ref <ref>', 'Drag end ref (for kind=drag)')
    .option('--values <values...>', 'Values to select (for kind=select)')
    .option('--width <n>', 'Viewport width (for kind=resize)', Number)
    .option('--height <n>', 'Viewport height (for kind=resize)', Number)
    .option('--fn <code>', 'JavaScript function body (for kind=evaluate)')
    .option('-t, --timeout <ms>', 'Action timeout in milliseconds', Number)
    .action(async function (this: Command) {
      const options = readCommandOptions<ActCommandOptions>(this);
      const ocConfig = resolveOpenClawConfig();

      if (!ocConfig.enabled) {
        console.error('OpenClaw integration is not enabled. Add { "openclaw": { "enabled": true } } to sweetlink.json.');
        process.exitCode = 1;
        return;
      }

      const action = buildAction(options);
      if (!action) {
        console.error(`Unknown or incomplete action kind: ${options.kind}`);
        process.exitCode = 1;
        return;
      }

      try {
        const client = new OpenClawClient(ocConfig);
        const result = await client.act(action);
        if (result.result !== undefined) {
          console.log(typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2));
        } else {
          console.log(`Action ${options.kind} completed.`);
        }
        if (result.url) {
          console.error(`URL: ${result.url}`);
        }
      } catch (error) {
        console.error('Action failed:', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });
}

function buildClickAction(options: ActCommandOptions, timeoutMs: number | undefined): OpenClawAction | null {
  if (!options.ref) return null;
  const button = options.button && VALID_BUTTONS.has(options.button)
    ? (options.button as 'left' | 'right' | 'middle')
    : undefined;
  return {
    kind: 'click',
    ref: options.ref,
    ...(options.doubleClick ? { doubleClick: true } : {}),
    ...(button ? { button } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
}

function buildTypeAction(options: ActCommandOptions, timeoutMs: number | undefined): OpenClawAction | null {
  if (!options.ref || options.text === undefined) return null;
  const text = validateStringLength(options.text, MAX_TEXT_LENGTH);
  if (text === null) return null;
  return {
    kind: 'type',
    ref: options.ref,
    text,
    ...(options.submit ? { submit: true } : {}),
    ...(options.slowly ? { slowly: true } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
}

function buildSelectAction(options: ActCommandOptions, timeoutMs: number | undefined): OpenClawAction | null {
  if (!(options.ref && options.values)) return null;
  const validatedValues = options.values.map((v) => validateStringLength(v, MAX_VALUE_LENGTH));
  if (validatedValues.some((v) => v === null)) return null;
  return { kind: 'select', ref: options.ref, values: validatedValues as string[], ...(timeoutMs !== undefined ? { timeoutMs } : {}) };
}

function buildAction(options: ActCommandOptions): OpenClawAction | null {
  const timeoutMs = safePositiveInt(options.timeout, MAX_TIMEOUT_MS);

  switch (options.kind) {
    case 'click':
      return buildClickAction(options, timeoutMs);
    case 'type':
      return buildTypeAction(options, timeoutMs);
    case 'press':
      return options.key ? { kind: 'press', key: options.key } : null;
    case 'hover':
      return options.ref ? { kind: 'hover', ref: options.ref, ...(timeoutMs !== undefined ? { timeoutMs } : {}) } : null;
    case 'drag':
      return options.startRef && options.endRef
        ? { kind: 'drag', startRef: options.startRef, endRef: options.endRef, ...(timeoutMs !== undefined ? { timeoutMs } : {}) }
        : null;
    case 'select':
      return buildSelectAction(options, timeoutMs);
    case 'resize': {
      const width = safePositiveInt(options.width, MAX_DIMENSION);
      const height = safePositiveInt(options.height, MAX_DIMENSION);
      return width !== undefined && height !== undefined ? { kind: 'resize', width, height } : null;
    }
    case 'wait':
      return { kind: 'wait', ...(timeoutMs !== undefined ? { timeoutMs } : {}) };
    case 'evaluate': {
      if (!options.fn) return null;
      const fn = validateStringLength(options.fn, MAX_FN_LENGTH);
      return fn !== null ? { kind: 'evaluate', fn, ...(options.ref ? { ref: options.ref } : {}) } : null;
    }
    case 'close':
      return { kind: 'close' };
    default:
      return null;
  }
}
