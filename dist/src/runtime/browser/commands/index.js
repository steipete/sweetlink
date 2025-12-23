import { loadDefaultExportFromUrl } from '../module-loader.js';
import { discoverSelectorCandidates } from '../selector-discovery.js';
import { CONSOLE_LEVELS, getConsoleMethod, setConsoleMethod } from '../utils/console.js';
import { getBrowserWindow } from '../utils/environment.js';
import { toError } from '../utils/errors.js';
import { sanitizeResult } from '../utils/sanitize.js';
export function createCommandExecutor(context) {
    return {
        execute: (command) => executeCommand(command, context),
    };
}
function executeCommand(command, context) {
    const started = performance.now();
    try {
        switch (command.type) {
            case 'runScript': {
                return runScriptCommand(command, started);
            }
            case 'getDom': {
                return runGetDomCommand(command, started);
            }
            case 'navigate': {
                return runNavigateCommand(command, started);
            }
            case 'ping': {
                return runPingCommand(command, started);
            }
            case 'screenshot': {
                return runScreenshotCommand(command, started, context);
            }
            case 'discoverSelectors': {
                return runSelectorDiscoveryCommand(command, started);
            }
            default: {
                throw new Error(`Unsupported command type ${command.type}`);
            }
        }
    }
    catch (error) {
        const error_ = toError(error);
        const durationMs = performance.now() - started;
        const result = {
            ok: false,
            commandId: command.id,
            durationMs,
            error: error_.message,
            stack: error_.stack,
        };
        return Promise.resolve(result);
    }
}
async function runScriptCommand(command, started) {
    const events = [];
    const restore = command.captureConsole ? interceptConsole(events) : null;
    try {
        const moduleSource = `
      'use strict';
      export default async function run(window, document, console) {
        ${command.code}
      }
    `;
        const blob = new Blob([moduleSource], { type: 'text/javascript' });
        const moduleUrl = URL.createObjectURL(blob);
        let runner;
        try {
            runner = await loadDefaultExportFromUrl(moduleUrl);
        }
        finally {
            URL.revokeObjectURL(moduleUrl);
        }
        if (typeof runner !== 'function') {
            throw new TypeError('Injected script did not export a runnable function');
        }
        const execute = runner;
        const resultValue = await execute(getBrowserWindow() ?? window, document, console);
        const durationMs = performance.now() - started;
        const response = {
            ok: true,
            commandId: command.id,
            durationMs,
            data: sanitizeResult(resultValue),
            console: events.length > 0 ? events : undefined,
        };
        return response;
    }
    catch (error) {
        const error_ = toError(error);
        const durationMs = performance.now() - started;
        const response = {
            ok: false,
            commandId: command.id,
            durationMs,
            error: error_.message,
            stack: error_.stack,
            console: events.length > 0 ? events : undefined,
        };
        return response;
    }
    finally {
        if (restore) {
            restore();
        }
    }
}
function runGetDomCommand(command, started) {
    let data;
    if (command.selector) {
        const element = document.querySelector(command.selector);
        data = element ? element.outerHTML : null;
    }
    else {
        data = document.documentElement.outerHTML;
    }
    const durationMs = performance.now() - started;
    return Promise.resolve({
        ok: true,
        commandId: command.id,
        durationMs,
        data,
    });
}
function runNavigateCommand(command, started) {
    (getBrowserWindow() ?? window).location.assign(command.url);
    const durationMs = performance.now() - started;
    return Promise.resolve({
        ok: true,
        commandId: command.id,
        durationMs,
        data: { redirectedTo: command.url },
    });
}
function runPingCommand(command, started) {
    const durationMs = performance.now() - started;
    return Promise.resolve({
        ok: true,
        commandId: command.id,
        durationMs,
        data: { now: Date.now() },
    });
}
function runSelectorDiscoveryCommand(command, started) {
    const limit = Number.isFinite(command.limit) && command.limit ? Math.max(1, Math.floor(command.limit)) : 20;
    const includeHidden = command.includeHidden === true;
    const candidates = discoverSelectorCandidates({
        scopeSelector: command.scopeSelector ?? null,
        limit,
        includeHidden,
    });
    const durationMs = performance.now() - started;
    const payload = {
        candidates,
    };
    return Promise.resolve({
        ok: true,
        commandId: command.id,
        durationMs,
        data: payload,
    });
}
async function runScreenshotCommand(command, started, context) {
    const durationStart = started;
    let targetInfo = context.screenshotHooks.resolveTarget(command);
    try {
        await context.screenshotHooks.applyPreHooks(command, targetInfo);
        if (command.mode === 'element') {
            targetInfo = context.screenshotHooks.resolveTarget(command);
        }
        const data = await context.screenshotHooks.captureScreenshot(command, targetInfo);
        const durationMs = performance.now() - durationStart;
        return {
            ok: true,
            commandId: command.id,
            durationMs,
            data,
        };
    }
    catch (error) {
        const error_ = toError(error);
        const durationMs = performance.now() - durationStart;
        return {
            ok: false,
            commandId: command.id,
            durationMs,
            error: error_.message,
            stack: error_.stack,
        };
    }
}
function interceptConsole(buffer) {
    const original = new Map();
    const consoleWithLevels = console;
    for (const level of CONSOLE_LEVELS) {
        const originalFunction = getConsoleMethod(consoleWithLevels, level);
        if (typeof originalFunction !== 'function') {
            continue;
        }
        original.set(level, originalFunction);
        const replacement = ((...arguments_) => {
            buffer.push({
                id: `${level}-${Date.now().toString()}-${Math.random().toString(16).slice(2)}`,
                timestamp: Date.now(),
                level,
                args: arguments_.map((argument) => sanitizeResult(argument)),
            });
            const typedArguments = arguments_;
            originalFunction.apply(console, typedArguments);
        });
        setConsoleMethod(consoleWithLevels, level, replacement);
    }
    return () => {
        for (const level of CONSOLE_LEVELS) {
            const stored = original.get(level);
            if (stored) {
                setConsoleMethod(consoleWithLevels, level, stored);
            }
        }
    };
}
//# sourceMappingURL=index.js.map