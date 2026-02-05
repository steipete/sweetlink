import type { Command } from 'commander';
import { readCommandOptions } from '../core/env.js';
import { OpenClawClient } from '../openclaw/client.js';
import { resolveOpenClawConfig } from '../openclaw/config.js';
import type { OpenClawAction } from '../openclaw/types.js';

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
    .requiredOption('--kind <kind>', 'Action kind: click, type, press, hover, drag, select, fill, resize, wait, evaluate, close')
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

      const client = new OpenClawClient(ocConfig);
      const action = buildAction(options);
      if (!action) {
        console.error(`Unknown or incomplete action kind: ${options.kind}`);
        process.exitCode = 1;
        return;
      }

      const result = await client.act(action);
      if (result.result !== undefined) {
        console.log(typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2));
      } else {
        console.log(`Action ${options.kind} completed.`);
      }
      if (result.url) {
        console.error(`URL: ${result.url}`);
      }
    });
}

function buildAction(options: ActCommandOptions): OpenClawAction | null {
  const timeoutMs = options.timeout;

  switch (options.kind) {
    case 'click': {
      if (!options.ref) return null;
      return {
        kind: 'click',
        ref: options.ref,
        ...(options.doubleClick ? { doubleClick: true } : {}),
        ...(options.button ? { button: options.button as 'left' | 'right' | 'middle' } : {}),
        ...(timeoutMs ? { timeoutMs } : {}),
      };
    }
    case 'type': {
      if (!options.ref || options.text === undefined) return null;
      return {
        kind: 'type',
        ref: options.ref,
        text: options.text,
        ...(options.submit ? { submit: true } : {}),
        ...(options.slowly ? { slowly: true } : {}),
        ...(timeoutMs ? { timeoutMs } : {}),
      };
    }
    case 'press': {
      if (!options.key) return null;
      return { kind: 'press', key: options.key };
    }
    case 'hover': {
      if (!options.ref) return null;
      return { kind: 'hover', ref: options.ref, ...(timeoutMs ? { timeoutMs } : {}) };
    }
    case 'drag': {
      if (!(options.startRef && options.endRef)) return null;
      return { kind: 'drag', startRef: options.startRef, endRef: options.endRef, ...(timeoutMs ? { timeoutMs } : {}) };
    }
    case 'select': {
      if (!(options.ref && options.values)) return null;
      return { kind: 'select', ref: options.ref, values: options.values, ...(timeoutMs ? { timeoutMs } : {}) };
    }
    case 'resize': {
      if (options.width === undefined || options.height === undefined) return null;
      return { kind: 'resize', width: options.width, height: options.height };
    }
    case 'wait':
      return { kind: 'wait', ...(timeoutMs ? { timeoutMs } : {}) };
    case 'evaluate': {
      if (!options.fn) return null;
      return { kind: 'evaluate', fn: options.fn, ...(options.ref ? { ref: options.ref } : {}) };
    }
    case 'close':
      return { kind: 'close' };
    default:
      return null;
  }
}
