import { readCommandOptions } from '../core/env.js';
import { OpenClawClient } from '../openclaw/client.js';
import { resolveOpenClawConfig } from '../openclaw/config.js';
const VALID_BUTTONS = new Set(['left', 'right', 'middle']);
const MAX_DIMENSION = 32_767; // Reasonable upper bound for viewport dimensions
const MAX_TIMEOUT_MS = 300_000; // 5 minutes max timeout
const MAX_TEXT_LENGTH = 1_000_000; // 1MB max for text input
const MAX_FN_LENGTH = 100_000; // 100KB max for JavaScript code
const MAX_VALUE_LENGTH = 10_000; // 10KB max per select value
const MAX_REF_LENGTH = 1000; // 1KB max for element ref IDs
const MAX_KEY_LENGTH = 100; // 100 chars max for key names
/** Validates a positive integer within safe bounds. Returns undefined if invalid. */
function safePositiveInt(value, max) {
    if (value === undefined)
        return undefined;
    if (!Number.isFinite(value) || value <= 0 || value > max)
        return undefined;
    return Math.floor(value);
}
/** Validates string length. Returns null if exceeds max. */
function validateStringLength(value, max) {
    if (value === undefined)
        return null;
    if (value.length > max)
        return null;
    return value;
}
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
function buildClickAction(options, timeoutMs) {
    const ref = validateStringLength(options.ref, MAX_REF_LENGTH);
    if (!ref)
        return null;
    const button = options.button && VALID_BUTTONS.has(options.button)
        ? options.button
        : undefined;
    return {
        kind: 'click',
        ref,
        ...(options.doubleClick ? { doubleClick: true } : {}),
        ...(button ? { button } : {}),
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    };
}
function buildTypeAction(options, timeoutMs) {
    const ref = validateStringLength(options.ref, MAX_REF_LENGTH);
    if (!ref || options.text === undefined)
        return null;
    const text = validateStringLength(options.text, MAX_TEXT_LENGTH);
    if (text === null)
        return null;
    return {
        kind: 'type',
        ref,
        text,
        ...(options.submit ? { submit: true } : {}),
        ...(options.slowly ? { slowly: true } : {}),
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    };
}
function buildSelectAction(options, timeoutMs) {
    const ref = validateStringLength(options.ref, MAX_REF_LENGTH);
    if (!(ref && options.values))
        return null;
    const validatedValues = options.values.map((v) => validateStringLength(v, MAX_VALUE_LENGTH));
    if (validatedValues.some((v) => v === null))
        return null;
    return { kind: 'select', ref, values: validatedValues, ...(timeoutMs !== undefined ? { timeoutMs } : {}) };
}
function buildAction(options) {
    const timeoutMs = safePositiveInt(options.timeout, MAX_TIMEOUT_MS);
    switch (options.kind) {
        case 'click':
            return buildClickAction(options, timeoutMs);
        case 'type':
            return buildTypeAction(options, timeoutMs);
        case 'press': {
            const key = validateStringLength(options.key, MAX_KEY_LENGTH);
            return key ? { kind: 'press', key } : null;
        }
        case 'hover': {
            const ref = validateStringLength(options.ref, MAX_REF_LENGTH);
            return ref ? { kind: 'hover', ref, ...(timeoutMs !== undefined ? { timeoutMs } : {}) } : null;
        }
        case 'drag': {
            const startRef = validateStringLength(options.startRef, MAX_REF_LENGTH);
            const endRef = validateStringLength(options.endRef, MAX_REF_LENGTH);
            return startRef && endRef
                ? { kind: 'drag', startRef, endRef, ...(timeoutMs !== undefined ? { timeoutMs } : {}) }
                : null;
        }
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
            const fn = validateStringLength(options.fn, MAX_FN_LENGTH);
            if (!fn)
                return null;
            const ref = validateStringLength(options.ref, MAX_REF_LENGTH);
            return { kind: 'evaluate', fn, ...(ref ? { ref } : {}) };
        }
        case 'close':
            return { kind: 'close' };
        default:
            return null;
    }
}
//# sourceMappingURL=act.js.map