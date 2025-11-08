export const CONSOLE_LEVELS = ['log', 'info', 'warn', 'error', 'debug'];
export function getConsoleMethod(target, level) {
    switch (level) {
        case 'log': {
            return typeof target.log === 'function' ? target.log : undefined;
        }
        case 'info': {
            return typeof target.info === 'function' ? target.info : undefined;
        }
        case 'warn': {
            return typeof target.warn === 'function' ? target.warn : undefined;
        }
        case 'error': {
            return typeof target.error === 'function' ? target.error : undefined;
        }
        case 'debug': {
            return typeof target.debug === 'function' ? target.debug : undefined;
        }
        default: {
            return undefined;
        }
    }
}
export function setConsoleMethod(target, level, function_) {
    if (!function_) {
        return;
    }
    switch (level) {
        case 'log': {
            target.log = function_;
            return;
        }
        case 'info': {
            target.info = function_;
            return;
        }
        case 'warn': {
            target.warn = function_;
            return;
        }
        case 'error': {
            target.error = function_;
            return;
        }
        case 'debug': {
            target.debug = function_;
            return;
        }
    }
}
//# sourceMappingURL=console.js.map