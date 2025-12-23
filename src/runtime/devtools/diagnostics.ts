import type { Request } from 'playwright-core';
import { BENIGN_CONSOLE_TYPES, IGNORABLE_DIAGNOSTIC_MESSAGES } from './constants.js';
import type {
  BootstrapDiagnosticError,
  SweetLinkBootstrapDiagnostics,
} from './types.js';
import type { DevToolsConsoleEntry, DevToolsNetworkEntry } from './config.js';

type RequestLike = Pick<Request, 'method' | 'url' | 'resourceType'>;

type LineCollector = {
  append: (line: string) => void;
  flush: () => void;
};

const createLineCollector = (maxLines = 100): LineCollector => {
  const lines: string[] = [];
  let truncatedCount = 0;

  return {
    append(line: string) {
      if (lines.length < maxLines) {
        lines.push(line);
      } else {
        truncatedCount += 1;
      }
    },
    flush() {
      for (const line of lines) {
        console.warn(line);
      }
      if (truncatedCount > 0) {
        console.warn(
          `Console output truncated to ${maxLines} lines. Run "pnpm sweetlink devtools console --tail ${
            maxLines * 2
          }" for full logs.`
        );
      }
    },
  };
};

const isAuthDiagnostic = (entry: BootstrapDiagnosticError | undefined): boolean => {
  if (!entry) {
    return false;
  }
  const type = typeof entry.type === 'string' ? entry.type.toLowerCase() : '';
  if (type === 'auth-fetch') {
    return true;
  }
  const message = typeof entry.message === 'string' ? entry.message : '';
  return message.includes('Authentication required');
};

const appendAuthDiagnostics = (append: LineCollector['append'], diagnostics: readonly BootstrapDiagnosticError[]) => {
  const authDiagnostics = diagnostics.filter((entry) => isAuthDiagnostic(entry));
  if (authDiagnostics.length === 0) {
    return;
  }
  append(
    `Detected ${authDiagnostics.length} authentication failure${authDiagnostics.length === 1 ? '' : 's'} while loading the page.`
  );
  for (const entry of authDiagnostics.slice(-5)) {
    const statusLabel = entry?.status ? ` status=${entry.status}` : '';
    const originLabel = entry?.source ? ` (${entry.source})` : '';
    const message = typeof entry?.message === 'string' ? entry.message : 'Authentication required';
    append(`  auth${statusLabel}${originLabel}: ${message}`);
  }
  append('  Hint: complete the real OAuth consent flow or issue a new session token before rerunning SweetLink.');
};

const appendConsoleErrors = (
  append: LineCollector['append'],
  label: string,
  diagnostics: readonly BootstrapDiagnosticError[]
) => {
  for (const error of diagnostics) {
    if (isAuthDiagnostic(error)) {
      continue;
    }
    const origin = error?.source ? ` (${error.source})` : '';
    append(`${label} console ${error?.type ?? 'error'}${origin}: ${error?.message ?? 'unknown error'}`);
    if (error?.stack) {
      for (const stackLine of error.stack.split('\n')) {
        append(`  ${stackLine.trim()}`);
      }
    }
  }
};

const appendOverlayDiagnostics = (
  append: LineCollector['append'],
  label: string,
  overlayText: string | undefined | null
) => {
  if (!overlayText) {
    return;
  }
  append(`${label} Next.js overlay:`);
  for (const overlayLine of overlayText.split('\n')) {
    const normalized = overlayLine.replaceAll(/\s+/g, ' ').trim();
    if (normalized.length === 0) {
      continue;
    }
    append(`  ${normalized.length > 200 ? `${normalized.slice(0, 199)}\u2026` : normalized}`);
  }
};

const appendRouteError = (
  append: LineCollector['append'],
  label: string,
  routeError: SweetLinkBootstrapDiagnostics['nextRouteError']
) => {
  if (!routeError?.message) {
    return;
  }
  const digestLabel = routeError.digest ? ` (digest ${routeError.digest})` : '';
  append(`${label} route error: ${routeError.message}${digestLabel}`);
};

export function logBootstrapDiagnostics(label: string, diagnostics: SweetLinkBootstrapDiagnostics): void {
  const { append, flush } = createLineCollector();
  append(
    `${label} document=${diagnostics.readyState ?? 'unknown'}, autoFlag=${diagnostics.autoFlag ? 'set' : 'unset'}, emits=${diagnostics.bootstrapEmits ?? 0}, sessionStorage=${diagnostics.sessionStorageAuto ?? 'null'}.`
  );

  const errors: BootstrapDiagnosticError[] = Array.isArray(diagnostics.errors) ? diagnostics.errors : [];
  appendAuthDiagnostics(append, errors);
  appendConsoleErrors(append, label, errors);
  appendOverlayDiagnostics(append, label, diagnostics.overlayText);
  appendRouteError(append, label, diagnostics.nextRouteError);
  flush();
}

export function logDevtoolsConsoleSummary(label: string, entries: readonly DevToolsConsoleEntry[], limit = 20): void {
  if (entries.length === 0) {
    console.warn(`${label}: no console events captured.`);
    return;
  }

  const sorted = [...entries].toSorted((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  const interesting = sorted.filter((entry) => {
    if (!entry) return false;
    const type = entry.type?.toLowerCase() ?? '';
    if (BENIGN_CONSOLE_TYPES.has(type)) {
      return false;
    }
    const message = entry.text ?? '';
    if (IGNORABLE_DIAGNOSTIC_MESSAGES.some((ignored) => message.includes(ignored))) {
      return false;
    }
    return true;
  });

  const chosenSource = interesting.length > 0 ? interesting : sorted;
  const chosen = chosenSource.slice(-Math.min(limit, chosenSource.length));
  const interestingLabel = interesting.length > 0 ? 'error/warn' : 'recent';
  console.warn(
    `${label}: showing ${chosen.length} ${interestingLabel} console event${chosen.length === 1 ? '' : 's'}${
      interesting.length === 0 ? ' (no obvious errors detected)' : ''
    }.`
  );

  const skipped = chosenSource.length - chosen.length;
  for (const entry of chosen) {
    const timestamp = entry.ts ? new Date(entry.ts).toLocaleTimeString() : 'unknown';
    const location = entry.location?.url
      ? ` (${entry.location.url}${typeof entry.location.lineNumber === 'number' ? `:${entry.location.lineNumber}` : ''})`
      : '';
    const args =
      Array.isArray(entry.args) && entry.args.length > 0
        ? entry.args.map((value) => formatConsoleArg(value)).join(' ')
        : (entry.text ?? '');
    const message = args || '(no message)';
    console.warn(`  [${timestamp}] ${entry.type ?? 'log'}${location}: ${message}`);
  }

  if (skipped > 0) {
    console.warn(
      `  … ${skipped} additional event${skipped === 1 ? '' : 's'} not shown. Run "pnpm sweetlink devtools console --tail ${Math.min(
        200,
        chosenSource.length
      )}" for full output.`
    );
  }
}

export function diagnosticsContainBlockingIssues(diagnostics: SweetLinkBootstrapDiagnostics): boolean {
  if (diagnostics.overlayText) {
    return true;
  }
  if (diagnostics.nextRouteError?.message) {
    return true;
  }
  const authFailure = diagnostics.errors?.find((entry) => {
    const type = typeof entry?.type === 'string' ? entry.type.toLowerCase() : '';
    if (type === 'auth-fetch') {
      return true;
    }
    const message = typeof entry?.message === 'string' ? entry.message : '';
    return message.includes('Authentication required');
  });
  if (authFailure) {
    return true;
  }
  if (diagnostics.errors?.length) {
    const nonTrivialTypes = diagnostics.errors.filter((entry) => {
      const type = (entry.type ?? 'error').toLowerCase();
      if (type === 'error' || type === 'unhandledrejection' || type === 'warning') {
        const message = typeof entry.message === 'string' ? entry.message : '';
        if (message && IGNORABLE_DIAGNOSTIC_MESSAGES.some((needle) => message.includes(needle))) {
          return false;
        }
        return true;
      }
      return !BENIGN_CONSOLE_TYPES.has(type);
    });
    if (nonTrivialTypes.length > 0) {
      return true;
    }
  }
  return false;
}

export function formatConsoleArg(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function createNetworkEntryFromRequest(
  request: RequestLike,
  status?: number,
  failureText?: string
): DevToolsNetworkEntry {
  return {
    ts: Date.now(),
    method: request.method(),
    url: request.url(),
    resourceType: request.resourceType(),
    status,
    failureText,
  };
}
