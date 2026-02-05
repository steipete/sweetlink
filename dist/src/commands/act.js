import { readCommandOptions } from '../core/env.js';
import { OpenClawClient } from '../openclaw/client.js';
import { resolveOpenClawConfig } from '../openclaw/config.js';
const VALID_BUTTONS = new Set(['left', 'right', 'middle']);
export function registerActCommand(program) {
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
        .action(async function () {
        const options = readCommandOptions(this);
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
            }
            else {
                console.log(`Action ${options.kind} completed.`);
            }
            if (result.url) {
                console.error(`URL: ${result.url}`);
            }
        }
        catch (error) {
            console.error('Action failed:', error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    });
}
function buildAction(options) {
    const timeoutMs = options.timeout;
    switch (options.kind) {
        case 'click': {
            if (!options.ref)
                return null;
            const button = options.button && VALID_BUTTONS.has(options.button)
                ? options.button
                : undefined;
            return {
                kind: 'click',
                ref: options.ref,
                ...(options.doubleClick ? { doubleClick: true } : {}),
                ...(button ? { button } : {}),
                ...(timeoutMs !== undefined ? { timeoutMs } : {}),
            };
        }
        case 'type': {
            if (!options.ref || options.text === undefined)
                return null;
            return {
                kind: 'type',
                ref: options.ref,
                text: options.text,
                ...(options.submit ? { submit: true } : {}),
                ...(options.slowly ? { slowly: true } : {}),
                ...(timeoutMs !== undefined ? { timeoutMs } : {}),
            };
        }
        case 'press': {
            if (!options.key)
                return null;
            return { kind: 'press', key: options.key };
        }
        case 'hover': {
            if (!options.ref)
                return null;
            return { kind: 'hover', ref: options.ref, ...(timeoutMs !== undefined ? { timeoutMs } : {}) };
        }
        case 'drag': {
            if (!(options.startRef && options.endRef))
                return null;
            return { kind: 'drag', startRef: options.startRef, endRef: options.endRef, ...(timeoutMs !== undefined ? { timeoutMs } : {}) };
        }
        case 'select': {
            if (!(options.ref && options.values))
                return null;
            return { kind: 'select', ref: options.ref, values: options.values, ...(timeoutMs !== undefined ? { timeoutMs } : {}) };
        }
        case 'resize': {
            if (options.width === undefined || options.height === undefined)
                return null;
            if (options.width <= 0 || options.height <= 0)
                return null;
            return { kind: 'resize', width: Math.floor(options.width), height: Math.floor(options.height) };
        }
        case 'wait':
            return { kind: 'wait', ...(timeoutMs !== undefined ? { timeoutMs } : {}) };
        case 'evaluate': {
            if (!options.fn)
                return null;
            return { kind: 'evaluate', fn: options.fn, ...(options.ref ? { ref: options.ref } : {}) };
        }
        case 'close':
            return { kind: 'close' };
        default:
            return null;
    }
}
//# sourceMappingURL=act.js.map