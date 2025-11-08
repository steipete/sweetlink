#!/usr/bin/env node
import { mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, CommanderError, Option } from 'commander';
import { compact, uniq } from 'es-toolkit';
import { createSweetLinkCommandId, } from '../shared/src/index.js';
import { registerClickCommand } from './commands/click';
import { registerRunJsCommand } from './commands/run-js';
import { registerTrustCaCommand } from './commands/trust-ca';
import { readRootProgramOptions, resolveConfig } from './core/config';
import { loadSweetLinkFileConfig } from './core/config-file';
import { readCommandOptions } from './core/env';
import { cleanupControlledChromeRegistry, registerControlledChromeInstance } from './devtools-registry';
import { sweetLinkCliTestMode, sweetLinkDebug, sweetLinkEnv } from './env';
import { fetchJson } from './http';
import { collectPuppeteerDiagnostics, focusControlledChromePage, launchChrome, launchControlledChrome, prepareChromeLaunch, reuseExistingControlledChrome, signalSweetLinkBootstrap, waitForSweetLinkSession, } from './runtime/chrome';
import { buildCookieOrigins, collectChromeCookies, collectChromeCookiesForDomains, normalizePuppeteerCookie, } from './runtime/cookies';
import { ensureDevStackRunning as ensureDevStackRunningRuntime, isAppReachable as isAppReachableRuntime, maybeInstallMkcertDispatcher, } from './runtime/devstack';
import { attemptTwitterOauthAutoAccept, collectBootstrapDiagnostics, connectToDevTools, createEmptyDevToolsState, createNetworkEntryFromRequest, DEVTOOLS_CONSOLE_LIMIT, DEVTOOLS_NETWORK_LIMIT, DEVTOOLS_STATE_PATH, deriveDevtoolsLinkInfo, diagnosticsContainBlockingIssues, ensureBackgroundDevtoolsListener, fetchDevToolsTabs, formatConsoleArg, loadDevToolsConfig, loadDevToolsState, logBootstrapDiagnostics, saveDevToolsConfig, saveDevToolsState, serializeConsoleMessage, trimBuffer, } from './runtime/devtools';
import { fetchNextDevtoolsErrors } from './runtime/next-devtools';
import { attemptDevToolsCapture, maybeDescribeScreenshot, persistScreenshotResult, tryDevToolsRecovery, tryHtmlToImageFallback, } from './runtime/screenshot';
import { renderCommandResult } from './runtime/scripts';
import { buildClickScript, fetchConsoleEvents, fetchSessionSummaries, formatSessionHeadline, getSessionSummaryById, isSweetLinkSelectorCandidate, isSweetLinkSelectorDiscoveryResult, resolvePromptOption, resolveSessionIdFromHint, } from './runtime/session';
import { buildSmokeRouteUrl, clearSmokeProgress, consoleEventIndicatesAuthIssue, consoleEventIndicatesRuntimeError, DEFAULT_SMOKE_ROUTES, deriveSmokeRoutes, ensureSweetLinkSessionConnected, formatConsoleEventSummary, loadSmokeProgressIndex, navigateSweetLinkSession, saveSmokeProgressIndex, triggerSweetLinkCliAuto, waitForSmokeRouteReady, } from './runtime/smoke';
import { buildWaitCandidateUrls, configurePathRedirects, normalizeUrlForMatch, trimTrailingSlash } from './runtime/url';
import { buildScreenshotHooks } from './screenshot-hooks';
import { fetchCliToken } from './token';
import { describeAppForPrompt, formatAppLabel } from './util/app-label';
import { extractEventMessage, isErrnoException, logDebugError } from './util/errors';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
function formatDuration(ms) {
    if (!Number.isFinite(ms)) {
        return 'unknown';
    }
    const abs = Math.max(0, ms);
    if (abs < 1000) {
        return `${Math.round(abs)} ms`;
    }
    const seconds = abs / 1000;
    if (seconds < 60) {
        const precision = seconds < 10 ? 1 : 0;
        return `${seconds.toFixed(precision)} s`;
    }
    const minutes = seconds / 60;
    if (minutes < 60) {
        const precision = minutes < 10 ? 1 : 0;
        return `${minutes.toFixed(precision)} min`;
    }
    const hours = minutes / 60;
    if (hours < 24) {
        const precision = hours < 10 ? 1 : 0;
        return `${hours.toFixed(precision)} h`;
    }
    const days = hours / 24;
    const precision = days < 10 ? 1 : 0;
    return `${days.toFixed(precision)} d`;
}
const program = new Command();
program.name('sweetlink').description('Interact with SweetLink daemon sessions');
maybeInstallMkcertDispatcher();
const LOOSE_PATH_SUFFIXES = new Set(['home', 'index', 'overview']);
const { config: fileConfig } = loadSweetLinkFileConfig();
configurePathRedirects(fileConfig.redirects);
const { appUrl: envAppUrl, daemonUrl: envDaemonUrl, localAdminApiKey, adminApiKey: sharedAdminApiKey, prodAppUrl: envProdAppUrl, } = sweetLinkEnv;
const defaultAppLabel = formatAppLabel(fileConfig.appLabel ?? sweetLinkEnv.appLabel);
const defaultAppUrl = deriveDefaultAppUrl(envAppUrl, fileConfig);
const defaultProdAppUrl = fileConfig.prodUrl ?? envProdAppUrl;
const defaultDaemonUrl = fileConfig.daemonUrl ?? envDaemonUrl;
const defaultAdminKey = fileConfig.adminKey ?? localAdminApiKey ?? sharedAdminApiKey ?? '';
const defaultHealthPaths = fileConfig.healthChecks?.paths ?? null;
const LOCAL_DEFAULT_APP_URL = 'http://localhost:3000';
function deriveDefaultAppUrl(envUrl, config) {
    const configuredAppUrl = typeof config.appUrl === 'string' ? config.appUrl.trim() : '';
    if (configuredAppUrl.length > 0) {
        return configuredAppUrl;
    }
    if (typeof config.port === 'number' && Number.isFinite(config.port) && config.port > 0) {
        const baseUrl = envUrl ?? LOCAL_DEFAULT_APP_URL;
        return applyPortToUrl(baseUrl, config.port);
    }
    return envUrl ?? LOCAL_DEFAULT_APP_URL;
}
function applyPortToUrl(base, port) {
    try {
        const url = new URL(base);
        url.port = String(port);
        return url.toString();
    }
    catch {
        return `http://localhost:${port}`;
    }
}
function parseCliPort(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new CommanderError(1, 'InvalidPort', `--port expects a positive integer, received "${value}".`);
    }
    return parsed;
}
program
    .option('-a, --app-url <url>', 'Application base URL for SweetLink commands', defaultAppUrl)
    .option('--app-label <label>', 'Friendly name for your application (used in help output)', defaultAppLabel)
    .option('--url <url>', 'Alias for --app-url')
    .addOption(new Option('--port <number>', 'Override local app port (defaults to config or 3000)').argParser(parseCliPort))
    .option('-d, --daemon-url <url>', 'SweetLink daemon base URL', defaultDaemonUrl)
    .option('-k, --admin-key <key>', 'Optional admin API key (defaults to SWEETLINK_LOCAL_ADMIN_API_KEY or SWEETLINK_ADMIN_API_KEY env; falls back to legacy SWEETISTICS_* keys)', defaultAdminKey)
    .option('--oauth-script <path>', 'Absolute or relative path to an OAuth automation script (ESM module). Overrides config/env defaults.');
program
    .command('sessions')
    .description('List active SweetLink sessions')
    .option('--json', 'Output JSON instead of a table', false)
    .action(async (options, command) => {
    const config = resolveConfig(command);
    const token = await fetchCliToken(config);
    const [sessions, devtoolsConfig, devtoolsState] = await Promise.all([
        fetchSessionSummaries(config, token),
        loadDevToolsConfig().catch(() => null),
        loadDevToolsState().catch(() => null),
    ]);
    // Surface which SweetLink session (if any) currently maps to the controlled DevTools window.
    const devtoolsLinkInfo = deriveDevtoolsLinkInfo(devtoolsConfig, devtoolsState);
    const devtoolsSessionIds = devtoolsLinkInfo.sessionIds;
    const devtoolsEndpoint = devtoolsLinkInfo.endpoint;
    if (options.json) {
        const sessionsWithDevtools = sessions.map((session) => ({
            ...session,
            devtoolsLinked: devtoolsSessionIds.has(session.sessionId),
            devtoolsEndpoint: devtoolsSessionIds.has(session.sessionId) ? devtoolsEndpoint : null,
        }));
        process.stdout.write(`${JSON.stringify(sessionsWithDevtools, null, 2)}\n`);
        return;
    }
    if (sessions.length === 0) {
        console.log('No active SweetLink sessions.');
        console.log('Hint: run `pnpm sweetlink open --controlled --path /` to launch an authenticated tab automatically.');
        return;
    }
    const now = Date.now();
    console.log('Active SweetLink sessions:\n');
    for (const session of sessions) {
        const heartbeatMsAgo = typeof session.heartbeatMsAgo === 'number' ? session.heartbeatMsAgo : Math.max(0, now - session.lastSeenAt);
        const socketState = session.socketState ?? 'unknown';
        const consoleEventsBuffered = session.consoleEventsBuffered ?? 0;
        const consoleErrorsBuffered = session.consoleErrorsBuffered ?? 0;
        const pendingCommandCount = session.pendingCommandCount ?? 0;
        const openedMsAgo = Math.max(0, now - session.createdAt);
        console.log(`• ${formatSessionHeadline(session)}`);
        console.log(`  - url: ${session.url}`);
        const lastHeartbeatLabel = `${formatDuration(heartbeatMsAgo)} ago`;
        const openedLabel = `${formatDuration(openedMsAgo)} ago`;
        const socketLabel = `socket ${socketState}`;
        console.log(`  - last: ${lastHeartbeatLabel} • opened ${openedLabel} • ${socketLabel}`);
        const pendingLabel = pendingCommandCount === 1 ? 'command' : 'commands';
        const consoleLabel = consoleEventsBuffered > 0
            ? `${consoleEventsBuffered} event${consoleEventsBuffered === 1 ? '' : 's'}${consoleErrorsBuffered ? ` (${consoleErrorsBuffered} error${consoleErrorsBuffered === 1 ? '' : 's'})` : ''}`
            : 'none';
        console.log(`  - queues: ${pendingCommandCount} ${pendingLabel} • console ${consoleLabel}`);
        if (devtoolsSessionIds.has(session.sessionId)) {
            console.log(`  - devtools: linked${devtoolsEndpoint ? ` (${devtoolsEndpoint})` : ''}`);
        }
        if (session.userAgent) {
            console.log(`  - ua: ${session.userAgent}`);
        }
        console.log('');
    }
    console.log('Tip: run `pnpm sweetlink console <sessionId> -n 50` to inspect the most recent console events for a session.');
});
program
    .command('cookies')
    .description('Dump Chrome cookies for one or more domains or origins')
    .argument('<domains...>', 'Domains or fully-qualified origins (e.g. localhost, https://example.com)')
    .option('--json', 'Output JSON instead of a human-readable list', false)
    .action(async (domains, options) => {
    const uniqueDomains = uniq(compact(domains.map((domain) => domain.trim())));
    if (uniqueDomains.length === 0) {
        console.log('No domains provided; nothing to collect.');
        return;
    }
    const cookiesByDomain = await collectChromeCookiesForDomains(uniqueDomains);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(cookiesByDomain, null, 2)}\n`);
        return;
    }
    for (const domain of uniqueDomains) {
        const domainCookies = cookiesByDomain[domain];
        const cookies = Array.isArray(domainCookies) ? domainCookies : [];
        console.log(`\n${domain} — ${cookies.length} cookie${cookies.length === 1 ? '' : 's'}`);
        if (cookies.length === 0) {
            continue;
        }
        for (const cookie of cookies) {
            const scope = cookie.domain ? `domain=${cookie.domain}` : `url=${cookie.url ?? 'unknown'}`;
            const path = cookie.path ?? '/';
            const secureFlag = cookie.secure ? '; Secure' : '';
            const httpOnlyFlag = cookie.httpOnly ? '; HttpOnly' : '';
            console.log(`  • ${cookie.name} (${scope} ${path}${secureFlag}${httpOnlyFlag})`);
            console.log(`    ${cookie.value}`);
        }
    }
    console.log('');
});
registerRunJsCommand(program);
registerTrustCaCommand(program);
registerClickCommand(program);
program
    .command('console <sessionId>')
    .description('Fetch buffered console events for a session')
    .option('-n, --limit <count>', 'Show only the last <count> console events', Number)
    .option('--json', 'Output JSON', false)
    .action(async (sessionId, options, command) => {
    const config = resolveConfig(command);
    const resolvedSessionId = await resolveSessionIdFromHint(sessionId, config);
    const token = await fetchCliToken(config);
    const response = await fetchJson(`${config.daemonBaseUrl}/sessions/${encodeURIComponent(resolvedSessionId)}/console`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (options.json) {
        process.stdout.write(`${JSON.stringify(response.events, null, 2)}\n`);
        return;
    }
    if (response.events.length === 0) {
        console.log('No buffered console output.');
        return;
    }
    const limit = typeof options.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0
        ? Math.floor(options.limit)
        : null;
    const events = limit ? response.events.slice(-limit) : response.events;
    const startIndex = response.events.length - events.length;
    for (const [offset, event] of events.entries()) {
        const timestamp = new Date(event.timestamp).toLocaleTimeString();
        const prefix = `${startIndex + offset + 1}.`;
        console.log(`${prefix} [${timestamp}] ${event.level}:`, ...event.args);
    }
});
program
    .command('open')
    .description(`Open ${defaultAppLabel} in Chrome with SweetLink auto-enabled`)
    .option('-e, --env <env>', 'Environment to open (dev or prod)', 'dev')
    .option('-p, --path <path>', 'Optional path to append (default "")', '')
    .option('--url <url>', 'Explicit URL to open (overrides --path and --env)')
    .option('--controlled', 'Launch Chrome in controlled mode with DevTools enabled', false)
    .option('--devtools-port <port>', 'Specify DevTools port to use with --controlled', Number)
    .option('--no-cookie-sync', 'Disable copying cookies from your main Chrome profile into the controlled window', false)
    .option('--timeout <seconds>', 'Seconds to wait for a SweetLink session (default 15)', Number)
    .option('--no-devtools', 'Skip DevTools automation when opening in controlled mode')
    .option('--headless', 'Launch the controlled browser headlessly', false)
    .option('--foreground', 'Bring the Chrome window to the foreground after opening (macOS only)', false)
    .action(async (options, command) => {
    await runOpenCommand(options, command, program);
});
async function runOpenCommand(options, command, rootProgram) {
    const context = buildOpenCommandContext(options, command, rootProgram);
    if (!context.controlled) {
        if (options.devtools === false) {
            console.log('--no-devtools is ignored when launching an uncontrolled browser window.');
        }
        if (options.headless) {
            console.log('--headless requires --controlled; launching a regular Chrome window instead.');
        }
    }
    if (context.headless && context.foreground) {
        console.log('--foreground is ignored in headless mode.');
    }
    if (context.env === 'dev') {
        await ensureDevStackRunningRuntime(context.targetUrl, {
            repoRoot,
            healthPaths: context.healthCheckPaths ?? undefined,
            server: context.serverConfig ?? undefined,
        });
    }
    const waitToken = await fetchWaitTokenIfNeeded(context);
    const appReachable = await checkOpenCommandReachability(context);
    if (!appReachable) {
        logOpenCommandReachabilityErrors(context);
        process.exitCode = 1;
        return;
    }
    if (context.controlled) {
        await handleControlledOpen(context, waitToken);
        return;
    }
    await handleUncontrolledOpen(context, waitToken);
}
function buildOpenCommandContext(options, command, rootProgram) {
    const config = resolveConfig(command);
    const env = normalizeOpenCommandEnvironment(options.env);
    const parent = command.parent ?? rootProgram;
    const parentOptions = readRootProgramOptions(parent);
    const developmentBaseUrl = parentOptions.appUrl;
    const productionBaseUrl = defaultProdAppUrl;
    const baseUrl = env === 'prod' ? productionBaseUrl : developmentBaseUrl;
    const explicitTarget = resolveExplicitTargetUrl(options.url);
    const targetUrl = explicitTarget ?? buildOpenCommandTargetUrl(baseUrl, options.path);
    const serverConfig = config.servers[env] ?? null;
    const preferredPort = typeof options.devtoolsPort === 'number' && Number.isFinite(options.devtoolsPort)
        ? options.devtoolsPort
        : undefined;
    const controlled = Boolean(options.controlled);
    const enableDevtools = controlled ? options.devtools !== false : true;
    const headless = controlled ? Boolean(options.headless) : false;
    const foreground = Boolean(options.foreground);
    return {
        config,
        appLabel: config.appLabel,
        env,
        controlled,
        preferredPort,
        shouldSyncCookies: resolveCookieSyncPreference(command, options.cookieSync),
        timeoutSeconds: resolveOpenCommandTimeoutSeconds(options.timeout),
        targetUrl,
        targetUrlString: targetUrl.toString(),
        enableDevtools,
        headless,
        foreground,
        healthCheckPaths: defaultHealthPaths,
        oauthScriptPath: config.oauthScriptPath,
        serverConfig,
    };
}
function normalizeOpenCommandEnvironment(value) {
    const normalized = (value ?? 'dev').trim().toLowerCase();
    if (normalized === 'dev' || normalized === 'prod') {
        return normalized;
    }
    throw new Error('Invalid environment. Use "dev" or "prod".');
}
function buildOpenCommandTargetUrl(baseUrl, rawPath) {
    let targetUrl;
    try {
        targetUrl = new URL(baseUrl);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse base URL "${baseUrl}": ${message}`);
    }
    targetUrl.searchParams.set('sweetlink', 'auto');
    const fallbackPath = '/timeline';
    const trimmedPath = rawPath?.trim();
    const pathSource = trimmedPath && trimmedPath.length > 0 ? trimmedPath : fallbackPath;
    const [pathPartRaw, queryPart] = pathSource.split('?', 2);
    const pathPart = pathPartRaw && pathPartRaw.length > 0 ? pathPartRaw : fallbackPath;
    targetUrl.pathname = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
    if (queryPart) {
        const extraSearch = new URLSearchParams(queryPart);
        for (const [key, value] of extraSearch.entries()) {
            targetUrl.searchParams.append(key, value);
        }
    }
    return targetUrl;
}
function resolveExplicitTargetUrl(raw) {
    if (!raw) {
        return null;
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        return null;
    }
    try {
        const target = new URL(trimmed);
        target.searchParams.set('sweetlink', target.searchParams.get('sweetlink') ?? 'auto');
        return target;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse --url value "${trimmed}": ${message}`);
    }
}
function resolveCookieSyncPreference(command, cookieSyncOption) {
    const source = command.getOptionValueSource?.('cookieSync');
    if (source === 'default') {
        return true;
    }
    return cookieSyncOption !== false;
}
function resolveOpenCommandTimeoutSeconds(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, value);
    }
    return 30;
}
async function fetchWaitTokenIfNeeded(context) {
    if (context.timeoutSeconds <= 0) {
        return null;
    }
    try {
        return await fetchCliToken(context.config);
    }
    catch (error) {
        console.warn('Unable to fetch CLI token for session wait:', error);
        return null;
    }
}
async function checkOpenCommandReachability(context) {
    return await isAppReachableRuntime(context.targetUrl.origin, context.healthCheckPaths ?? undefined);
}
function logOpenCommandReachabilityErrors(context) {
    console.error(`${context.targetUrl.origin} did not respond. Start ${describeAppForPrompt(context.appLabel)} and retry.`);
}
async function handleControlledOpen(context, waitToken) {
    const reuseResult = context.headless
        ? null
        : await reuseExistingControlledChrome(context.targetUrlString, {
            preferredPort: context.preferredPort,
            cookieSync: context.shouldSyncCookies,
            bringToFront: context.foreground,
        });
    if (reuseResult) {
        await handleControlledReuse(context, waitToken, reuseResult);
        return;
    }
    console.warn('No reusable controlled Chrome session matched the target; launching a fresh controlled window.');
    await handleControlledLaunch(context, waitToken);
}
async function handleControlledReuse(context, waitToken, reuseResult) {
    const shouldFocus = context.foreground && !context.headless;
    if (context.enableDevtools) {
        await registerControlledChromeInstance(reuseResult.devtoolsUrl, reuseResult.userDataDir);
        await cleanupControlledChromeRegistry(reuseResult.devtoolsUrl);
        await signalSweetLinkBootstrap(reuseResult.devtoolsUrl, context.targetUrlString);
        try {
            const oauthAttempt = await attemptTwitterOauthAutoAccept({
                devtoolsUrl: reuseResult.devtoolsUrl,
                sessionUrl: context.targetUrlString,
                scriptPath: context.oauthScriptPath,
            });
            if (oauthAttempt.handled) {
                console.log(`Automatically approved the OAuth prompt via ${oauthAttempt.action ?? 'click'}${oauthAttempt.clickedText ? ` (${oauthAttempt.clickedText})` : ''}.`);
            }
            else if (oauthAttempt.reason && oauthAttempt.reason !== 'button-not-found') {
                const locationHint = oauthAttempt.url || oauthAttempt.title || oauthAttempt.host
                    ? ` (at ${oauthAttempt.title ?? oauthAttempt.host ?? 'unknown page'} ${oauthAttempt.url ?? ''})`
                    : '';
                console.log(`OAuth auto-accept skipped: ${oauthAttempt.reason}${locationHint}.`);
            }
        }
        catch (error) {
            if (sweetLinkDebug) {
                console.warn('OAuth auto-accept attempt failed:', error);
            }
        }
    }
    else {
        console.log('DevTools automation disabled (--no-devtools); skipping telemetry bootstrap and OAuth auto-click.');
    }
    console.log(`Reused controlled Chrome at ${reuseResult.devtoolsUrl} (env: ${context.env}).`);
    if (reuseResult.targetAlreadyOpen) {
        console.log('Target tab was already open; activated existing page.');
    }
    else {
        console.log('Opened a new tab in the existing controlled Chrome window.');
    }
    if (context.enableDevtools) {
        console.log('The screenshot command will continue to use this DevTools instance.');
    }
    if (shouldFocus && context.enableDevtools) {
        const focused = await focusControlledChromePage(reuseResult.devtoolsUrl, context.targetUrlString);
        if (!focused && sweetLinkDebug) {
            console.warn('Unable to focus controlled Chrome window automatically.');
        }
    }
    else if (context.foreground && !context.enableDevtools) {
        console.log('--foreground requires DevTools automation; skipping automatic focus.');
    }
    console.log('Remember this session codename. Run `pnpm sweetlink sessions`, copy the session id or codename, and use that handle for every follow-up command instead of rerunning `pnpm sweetlink open`.');
    await waitForSessionAfterOpen(context, waitToken, {
        devtoolsUrl: context.enableDevtools ? reuseResult.devtoolsUrl : undefined,
        trigger: context.enableDevtools
            ? () => triggerSweetLinkCliAuto(reuseResult.devtoolsUrl, context.targetUrlString)
            : undefined,
        retryTrigger: context.enableDevtools
            ? () => triggerSweetLinkCliAuto(reuseResult.devtoolsUrl, context.targetUrlString)
            : undefined,
        failureMessage: context.enableDevtools
            ? 'Controlled Chrome reused but SweetLink did not register automatically.'
            : 'Controlled Chrome reused. DevTools automation disabled; verify the session from the UI if SweetLink does not appear.',
    });
    await surfaceBlockingDiagnosticsAfterNavigation('SweetLink open', context.enableDevtools ? reuseResult.devtoolsUrl : undefined, context.targetUrlString);
}
async function handleControlledLaunch(context, waitToken) {
    const info = await launchControlledChrome(context.targetUrlString, {
        port: context.preferredPort,
        cookieSync: context.shouldSyncCookies,
        headless: context.headless,
        foreground: context.foreground,
    });
    const userDataDirectoryDisplay = info.userDataDir.replace(os.homedir(), '~');
    if (context.enableDevtools) {
        await registerControlledChromeInstance(info.devtoolsUrl, info.userDataDir);
        await cleanupControlledChromeRegistry(info.devtoolsUrl);
        await signalSweetLinkBootstrap(info.devtoolsUrl, context.targetUrlString);
        try {
            const oauthAttempt = await attemptTwitterOauthAutoAccept({
                devtoolsUrl: info.devtoolsUrl,
                sessionUrl: context.targetUrlString,
                scriptPath: context.oauthScriptPath,
            });
            if (oauthAttempt.handled) {
                console.log(`Automatically approved the OAuth prompt via ${oauthAttempt.action ?? 'click'}${oauthAttempt.clickedText ? ` (${oauthAttempt.clickedText})` : ''}.`);
            }
            else if (oauthAttempt.reason && oauthAttempt.reason !== 'button-not-found') {
                const locationHint = oauthAttempt.url || oauthAttempt.title || oauthAttempt.host
                    ? ` (at ${oauthAttempt.title ?? oauthAttempt.host ?? 'unknown page'} ${oauthAttempt.url ?? ''})`
                    : '';
                console.log(`OAuth auto-accept skipped: ${oauthAttempt.reason}${locationHint}.`);
            }
        }
        catch (error) {
            if (sweetLinkDebug) {
                console.warn('OAuth auto-accept attempt failed:', error);
            }
        }
    }
    else {
        console.log('DevTools automation disabled (--no-devtools); launched without OAuth auto-click.');
    }
    console.log(`Opened controlled Chrome window to ${context.targetUrlString} (env: ${context.env}).`);
    console.log(`DevTools endpoint: ${info.devtoolsUrl}`);
    console.log(`User data dir   : ${userDataDirectoryDisplay}`);
    if (context.enableDevtools) {
        console.log('The screenshot command will auto-detect this DevTools instance.');
    }
    if (context.headless) {
        console.log('Running in headless mode (--headless).');
    }
    const shouldFocus = context.foreground && !context.headless;
    if (shouldFocus && context.enableDevtools) {
        const focused = await focusControlledChromePage(info.devtoolsUrl, context.targetUrlString);
        if (!focused && sweetLinkDebug) {
            console.warn('Unable to focus controlled Chrome window automatically.');
        }
    }
    else if (context.foreground && !context.enableDevtools) {
        console.log('--foreground requires DevTools automation; skipping automatic focus.');
    }
    await waitForSessionAfterOpen(context, waitToken, {
        devtoolsUrl: context.enableDevtools ? info.devtoolsUrl : undefined,
        failureMessage: context.enableDevtools
            ? 'Controlled Chrome launched but SweetLink did not register automatically; keep the window open and retry from the UI if needed.'
            : 'Controlled Chrome launched without DevTools automation; complete the login manually if SweetLink does not register.',
    });
    await surfaceBlockingDiagnosticsAfterNavigation('SweetLink open', context.enableDevtools ? info.devtoolsUrl : undefined, context.targetUrlString);
}
async function waitForSessionAfterOpen(context, waitToken, options) {
    if (!waitToken || context.timeoutSeconds <= 0) {
        return;
    }
    if (options.trigger) {
        await options.trigger();
    }
    const initialTimeoutSeconds = Math.min(12, context.timeoutSeconds);
    const session = await waitForSweetLinkSession({
        config: context.config,
        token: waitToken,
        targetUrl: context.targetUrlString,
        timeoutSeconds: initialTimeoutSeconds,
        devtoolsUrl: options.devtoolsUrl,
    });
    if (session) {
        return;
    }
    if (options.retryTrigger) {
        await options.retryTrigger();
        const remainingSeconds = Math.max(5, context.timeoutSeconds - initialTimeoutSeconds);
        const retrySession = await waitForSweetLinkSession({
            config: context.config,
            token: waitToken,
            targetUrl: context.targetUrlString,
            timeoutSeconds: Math.min(12, remainingSeconds),
            devtoolsUrl: options.devtoolsUrl,
        });
        if (retrySession) {
            return;
        }
    }
    if (!process.exitCode || process.exitCode === 0) {
        process.exitCode = 1;
    }
    if (options.failureMessage) {
        console.warn(options.failureMessage);
    }
    if (options.devtoolsUrl) {
        const candidates = buildWaitCandidateUrls(context.targetUrlString);
        try {
            const diagnostics = await collectBootstrapDiagnostics(options.devtoolsUrl, candidates);
            if (diagnostics) {
                console.warn('SweetLink bootstrap diagnostics (DevTools snapshot):');
                logBootstrapDiagnostics('SweetLink', diagnostics);
            }
        }
        catch (error) {
            console.warn('Failed to collect DevTools diagnostics:', error);
        }
        await logPuppeteerPageSnapshot('SweetLink', options.devtoolsUrl, context.targetUrlString);
    }
}
// Runs after every navigation so CLI users see the same crash text the browser shows.
// Diagnostics come from the chrome-devtools MCP (invoked via mcporter) so we stay
// in sync with the controlled tab even when the UI is broken.
async function surfaceBlockingDiagnosticsAfterNavigation(label, devtoolsUrl, targetUrl) {
    if (!devtoolsUrl) {
        return;
    }
    const candidates = buildWaitCandidateUrls(targetUrl);
    let loggedBlocking = false;
    try {
        const diagnostics = await collectBootstrapDiagnostics(devtoolsUrl, candidates);
        if (diagnostics) {
            const bootstrapIncomplete = diagnostics.autoFlag !== true ||
                (typeof diagnostics.sessionStorageAuto === 'string' && diagnostics.sessionStorageAuto.length > 0);
            const hasBlocking = diagnosticsContainBlockingIssues(diagnostics) || bootstrapIncomplete;
            if (hasBlocking) {
                console.warn(`${label}: detected runtime anomalies after navigation.`);
                logBootstrapDiagnostics(label, diagnostics);
                if (bootstrapIncomplete) {
                    console.warn(`${label}: SweetLink bootstrap did not complete (autoFlag=${diagnostics.autoFlag}, sessionStorage=${diagnostics.sessionStorageAuto}).`);
                }
                await logPuppeteerPageSnapshot(label, devtoolsUrl, targetUrl);
                loggedBlocking = true;
                if (!process.exitCode || process.exitCode === 0) {
                    process.exitCode = 1;
                }
            }
        }
    }
    catch (error) {
        console.warn('Failed to collect DevTools diagnostics after navigation:', error);
    }
    if (!loggedBlocking) {
        const nextErrors = await fetchNextDevtoolsErrors(targetUrl);
        if (nextErrors) {
            console.warn(`${label}: Next.js DevTools error summary:\n${nextErrors}`);
            if (!process.exitCode || process.exitCode === 0) {
                process.exitCode = 1;
            }
        }
    }
}
async function logPuppeteerPageSnapshot(label, devtoolsUrl, targetUrl) {
    try {
        // Puppeteer fallback gives us raw body text when the DevTools overlay fails to render,
        // which is handy when we're stuck on intermediate screens (e.g., Twitter OAuth).
        const snapshot = await collectPuppeteerDiagnostics(devtoolsUrl, targetUrl);
        if (!snapshot) {
            console.warn(`${label}: Puppeteer snapshot was unavailable.`);
            return;
        }
        if (snapshot.title) {
            console.warn(`${label} page title: ${snapshot.title}`);
        }
        if (snapshot.overlayText) {
            console.warn(`${label} overlay (via Puppeteer):`);
            for (const line of snapshot.overlayText.split('\n')) {
                const trimmed = line.trim();
                if (trimmed.length > 0) {
                    console.warn(`  ${trimmed}`);
                }
            }
            return;
        }
        if (snapshot.bodyText && snapshot.bodyText.trim().length > 0) {
            const condensed = snapshot.bodyText.replaceAll(/\s+/g, ' ').trim();
            const snippet = condensed.length > 600 ? `${condensed.slice(0, 600)}…` : condensed;
            console.warn(`${label} body text (via Puppeteer): ${snippet}`);
        }
        else if (!snapshot.overlayText) {
            console.warn(`${label}: Puppeteer snapshot contained no overlay or body text.`);
        }
    }
    catch (error) {
        console.warn(`${label}: Failed to capture Puppeteer diagnostics:`, error);
    }
}
async function handleUncontrolledOpen(context, waitToken) {
    await launchChrome(context.targetUrlString, { foreground: context.foreground });
    console.log(`Opened Chrome to ${context.targetUrlString} (env: ${context.env}).`);
    await waitForSessionAfterOpen(context, waitToken, {
        failureMessage: 'Chrome tab opened but SweetLink did not register within the timeout window. Use `pnpm sweetlink sessions` to inspect manually.',
    });
}
program
    .command('smoke')
    .description('Run the SweetLink authenticated smoke test across non-admin routes')
    .option('--session <sessionId>', 'Existing SweetLink session id or codename to reuse')
    .option('--routes <routes>', `Comma-separated list of routes (default ${DEFAULT_SMOKE_ROUTES.join(', ')})`)
    .option('--timeout <seconds>', 'Per-route timeout in seconds (default 45)', Number)
    .option('--resume', 'Resume from the last completed route', false)
    .action(async function () {
    const options = readCommandOptions(this);
    const routes = deriveSmokeRoutes(options.routes, DEFAULT_SMOKE_ROUTES);
    if (routes.length === 0) {
        console.log('No routes specified for the smoke test. Provide --routes or keep the default set.');
        return;
    }
    const timeoutSeconds = typeof options.timeout === 'number' && Number.isFinite(options.timeout) ? Math.max(5, options.timeout) : 45;
    await runSweetLinkSmoke({ sessionHint: options.session, routes, timeoutSeconds, resume: options.resume === true }, this);
});
program
    .command('screenshot <sessionId>')
    .description('Capture a JPEG screenshot from a SweetLink session')
    .option('-s, --selector <selector>', 'CSS selector to capture (defaults to full page)')
    .option('-q, --quality <0-1>', 'JPEG quality (0-1, default 0.92)', Number)
    .option('-o, --output <path>', 'Output path (defaults to /tmp/sweetlink-<timestamp>.jpg)')
    .option('-t, --timeout <ms>', 'Command timeout in milliseconds (default 30_000)', Number, 30000)
    .option('--devtools-url <url>', 'DevTools HTTP endpoint (default http://127.0.0.1:9222)')
    .option('--method <method>', 'Capture method: auto, puppeteer, html2canvas, html-to-image', 'auto')
    .option('--scroll-into-view', 'Scroll the target into view before capturing', false)
    .option('--scroll-selector <selector>', 'Selector to scroll into view (defaults to capture selector)')
    .option('--wait-for-selector <selector>', 'Wait for a selector to appear before capturing')
    .option('--wait-visible', 'Require the wait selector to be visible', false)
    .option('--wait-timeout <ms>', 'Timeout for --wait-for-selector (default 10_000)', Number, 10000)
    .option('--delay <ms>', 'Delay in milliseconds after hooks run (default 0)', Number)
    .option('--before-script <codeOrPath>', 'Inline JS (or @path) to run before capture')
    .option('--preset <name>', 'Hook preset compatibility alias (card-ready is applied automatically and no longer requires this flag)')
    .option('--prompt <prompt>', 'Send the saved screenshot to Codex for analysis')
    .addOption(program.createOption('--question <prompt>').hideHelp())
    .action(async (sessionId, options, command) => {
    const config = resolveConfig(command);
    const resolvedSessionId = await resolveSessionIdFromHint(sessionId, config);
    const token = await fetchCliToken(config);
    const mode = options.selector ? 'element' : 'full';
    const prompt = resolvePromptOption(options);
    const suppressOutput = Boolean(prompt);
    const logInfo = (...args) => {
        if (!suppressOutput) {
            console.log(...args);
        }
    };
    const now = new Date();
    const defaultOutput = path.join(os.tmpdir(), `sweetlink-${now.toISOString().replaceAll(':', '-').replaceAll('.', '-')}.jpg`);
    const outputPath = options.output ? path.resolve(options.output) : defaultOutput;
    const quality = typeof options.quality === 'number' && !Number.isNaN(options.quality) ? options.quality : 0.92;
    const method = normalizeScreenshotMethod(options.method);
    await mkdir(path.dirname(outputPath), { recursive: true }).catch(() => {
        /* ignore directory creation failures; writeFile will surface if it truly fails */
    });
    const devtoolsConfig = await loadDevToolsConfig();
    const devtoolsUrl = options.devtoolsUrl ?? devtoolsConfig?.devtoolsUrl ?? 'http://127.0.0.1:9222';
    let sessionSummary;
    try {
        sessionSummary = await getSessionSummaryById(config, token, resolvedSessionId);
    }
    catch {
        sessionSummary = undefined;
    }
    const wantsPuppeteer = method === 'puppeteer' || method === 'auto';
    if (wantsPuppeteer && sessionSummary?.url) {
        const devtoolsCaptureResult = await attemptDevToolsCapture({
            devtoolsUrl,
            outputPath,
            sessionUrl: sessionSummary.url,
            selector: options.selector,
            quality,
            mode,
        });
        if (devtoolsCaptureResult) {
            logInfo(`Saved screenshot to ${outputPath} (${devtoolsCaptureResult.width}x${devtoolsCaptureResult.height}, ${devtoolsCaptureResult.sizeKb.toFixed(1)} KB, method: ${devtoolsCaptureResult.renderer}).`);
            await maybeDescribeScreenshot(prompt, outputPath, { silent: suppressOutput, appLabel: config.appLabel });
            return;
        }
        if (method === 'puppeteer') {
            throw new Error('Failed to capture via Puppeteer. Ensure Chrome is running with a DevTools port (try `pnpm sweetlink open --controlled`).');
        }
    }
    const rendererOverride = method === 'html2canvas' || method === 'html-to-image' ? method : undefined;
    const beforeScriptCode = await resolveHookSnippet(options.beforeScript);
    const commandOptions = readCommandOptions(command);
    const presetCandidate = commandOptions.preset ?? options.preset;
    const presetRaw = typeof presetCandidate === 'string' ? presetCandidate.trim() : '';
    const presetName = presetRaw.toLowerCase();
    if (presetName.length > 0) {
        if (presetName === 'card-ready') {
            logInfo('Preset "card-ready" is now the default hook stack; the flag is optional.');
        }
        else {
            throw new Error(`Screenshot preset "${presetRaw}" is no longer supported. The built-in hooks cover the previous behaviour.`);
        }
    }
    const hookOptions = {
        selector: options.selector ?? null,
        scrollIntoView: Boolean(options.scrollIntoView),
        scrollSelector: options.scrollSelector,
        waitSelector: options.waitForSelector,
        waitVisible: options.waitVisible === undefined ? undefined : Boolean(options.waitVisible),
        waitTimeout: typeof options.waitTimeout === 'number' && Number.isFinite(options.waitTimeout)
            ? options.waitTimeout
            : undefined,
        delayMs: typeof options.delay === 'number' && Number.isFinite(options.delay) ? options.delay : undefined,
        beforeScript: beforeScriptCode ?? undefined,
    };
    const hooks = buildScreenshotHooks(hookOptions);
    if (hooks.length > 0) {
        logInfo(`Applying ${hooks.length} pre-capture hook${hooks.length === 1 ? '' : 's'} before screenshot.`);
    }
    const payload = {
        type: 'screenshot',
        id: createSweetLinkCommandId(),
        mode,
        selector: options.selector,
        quality,
        timeoutMs: typeof options.timeout === 'number' && !Number.isNaN(options.timeout) ? options.timeout : 30000,
        renderer: rendererOverride,
        hooks: hooks.length > 0 ? hooks : undefined,
    };
    const response = await fetchJson(`${config.daemonBaseUrl}/sessions/${encodeURIComponent(resolvedSessionId)}/command`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    const { result } = response;
    if (!result.ok) {
        if (rendererOverride) {
            const fallbackOutcome = await tryHtmlToImageFallback({
                config,
                token,
                sessionId: resolvedSessionId,
                payload,
                outputPath,
                prompt,
                suppressOutput,
                rendererOverride,
                failureReason: result.error,
            });
            if (fallbackOutcome.handled) {
                return;
            }
            const fallbackError = fallbackOutcome.fallbackResult.ok ? null : fallbackOutcome.fallbackResult.error;
            const recovered = await tryDevToolsRecovery({
                sessionUrl: sessionSummary?.url,
                devtoolsUrl,
                selector: options.selector,
                quality,
                mode,
                outputPath,
                prompt,
                suppressOutput,
                logInfo,
                appLabel: config.appLabel,
                failureReason: fallbackError ?? result.error,
            });
            if (recovered) {
                return;
            }
            renderCommandResult(fallbackOutcome.fallbackResult);
            process.exitCode = 1;
            return;
        }
        const recovered = await tryDevToolsRecovery({
            sessionUrl: sessionSummary?.url,
            devtoolsUrl,
            selector: options.selector,
            quality,
            mode,
            outputPath,
            prompt,
            suppressOutput,
            logInfo,
            appLabel: config.appLabel,
            failureReason: result.error,
        });
        if (recovered) {
            return;
        }
        renderCommandResult(result);
        process.exitCode = 1;
        return;
    }
    await persistScreenshotResult(outputPath, result, { silent: suppressOutput });
    await maybeDescribeScreenshot(prompt, outputPath, { silent: suppressOutput, appLabel: config.appLabel });
});
program
    .command('selectors <sessionId>')
    .description('Discover candidate selectors within a SweetLink session')
    .option('-l, --limit <count>', 'Maximum number of candidates to return (default 20)', Number)
    .option('-m, --max <count>', 'Alias for --limit', Number)
    .option('--scope <selector>', 'Restrict discovery to elements inside this selector')
    .option('--include-hidden', 'Include off-screen or hidden elements', false)
    .option('--json', 'Output JSON payload', false)
    .action(async (sessionId, options, command) => {
    const config = resolveConfig(command);
    const resolvedSessionId = await resolveSessionIdFromHint(sessionId, config);
    const token = await fetchCliToken(config);
    const limit = (() => {
        if (typeof options.max === 'number' && Number.isFinite(options.max)) {
            return Math.max(1, Math.floor(options.max));
        }
        if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
            return Math.max(1, Math.floor(options.limit));
        }
        return 20;
    })();
    const payload = {
        type: 'discoverSelectors',
        id: createSweetLinkCommandId(),
        scopeSelector: options.scope ?? null,
        limit,
        includeHidden: Boolean(options.includeHidden),
    };
    const response = await fetchJson(`${config.daemonBaseUrl}/sessions/${encodeURIComponent(resolvedSessionId)}/command`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    const { result } = response;
    if (!result.ok) {
        renderCommandResult(result);
        process.exitCode = 1;
        return;
    }
    const raw = result.data;
    let candidates = [];
    if (Array.isArray(raw) && raw.every((candidate) => isSweetLinkSelectorCandidate(candidate))) {
        candidates = [...raw];
    }
    else if (isSweetLinkSelectorDiscoveryResult(raw)) {
        candidates = [...raw.candidates];
    }
    if (options.json) {
        process.stdout.write(`${JSON.stringify({ candidates }, null, 2)}\n`);
        return;
    }
    if (candidates.length === 0) {
        console.log('No candidates were discovered. Ensure the target UI is mounted and try again.');
        console.log('Tip: use --scope to limit discovery or --include-hidden to inspect collapsed panels.');
        return;
    }
    console.log(`Discovered ${candidates.length} selector candidate${candidates.length === 1 ? '' : 's'} (limit ${limit}):\n`);
    for (const candidate of candidates.slice(0, limit)) {
        console.log(`• ${candidate.selector}`);
        console.log(`  Hook     : ${candidate.hook} (score ${candidate.score})`);
        console.log(`  Visible  : ${candidate.visible ? 'yes' : 'no'} (${candidate.size.width}x${candidate.size.height})`);
        console.log(`  Text     : ${candidate.textSnippet}`);
        if (candidate.dataTarget) {
            console.log(`  Target   : data-sweetlink-target="${candidate.dataTarget}"`);
        }
        else if (candidate.id) {
            console.log(`  Target   : id="${candidate.id}"`);
        }
        if (candidate.dataTestId) {
            console.log(`  Test ID  : data-testid="${candidate.dataTestId}"`);
        }
        console.log(`  Position : x=${candidate.position.left}, y=${candidate.position.top}`);
        console.log(`  Path     : ${candidate.path}`);
        console.log('');
    }
});
const devtools = program.command('devtools').description('Inspect DevTools-enabled Chrome sessions');
devtools
    .command('status')
    .description('Show DevTools connection status and telemetry summary')
    .option('--json', 'Output JSON payload', false)
    .action(async (options, command) => {
    await devtoolsStatus(options, command);
});
devtools
    .command('tabs')
    .description('List open tabs in the controlled Chrome window')
    .option('--json', 'Output JSON payload', false)
    .action(async (options) => {
    await devtoolsTabs(options);
});
devtools
    .command('console')
    .description('Print buffered console events from the controlled Chrome window')
    .option('--tail <count>', 'Number of entries to show (default 50)', Number, 50)
    .option('--json', 'Output JSON payload', false)
    .action(async (options) => {
    await devtoolsShowConsole(options);
});
devtools
    .command('network')
    .description('Print buffered network requests from the controlled Chrome window')
    .option('--tail <count>', 'Number of entries to show (default 50)', Number, 50)
    .option('--json', 'Output JSON payload', false)
    .action(async (options) => {
    await devtoolsShowNetwork(options);
});
devtools
    .command('listen')
    .description('Attach to DevTools and buffer console/network telemetry locally')
    .option('--session <sessionId>', 'Associate telemetry with a SweetLink session id')
    .option('--reset', 'Clear existing telemetry buffers before listening', false)
    .option('--background', 'Run without interactive prompts (for automation)', false)
    .action(async (options, command) => {
    await devtoolsListen(options, command);
});
devtools
    .command('authorize')
    .description('Attempt to auto-click the OAuth authorize prompt in the controlled browser')
    .option('--url <url>', 'Override the candidate OAuth URL (defaults to the tracked session)')
    .action(async (options, command) => {
    await devtoolsAuthorize(options, command);
});
program.hook('preAction', () => {
    // Ensure commander does not swallow promise rejections so we can log helpful messages.
    process.on('unhandledRejection', (error) => {
        reportError(error);
        process.exitCode = 1;
    });
});
program.addHelpText('afterAll', `
DevTools commands:
  devtools status            Show endpoint reachability, viewport, and buffer sizes
  devtools tabs              List open tabs in the controlled Chrome window
  devtools listen            Attach to DevTools and stream console/network telemetry to disk
  devtools authorize         Force an OAuth authorize click in the active controlled tab
  devtools console [options] Print buffered console events (use --tail / --json)
  devtools network [options] Print buffered network entries (use --tail / --json)
`);
program.exitOverride();
try {
    if (!sweetLinkCliTestMode) {
        await program.parseAsync(process.argv);
    }
}
catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) {
        process.exitCode = 0;
    }
    else {
        reportError(error);
        process.exitCode = error instanceof CommanderError ? error.exitCode : 1;
    }
}
async function resolveHookSnippet(value) {
    if (!value) {
        return null;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return null;
    }
    if (trimmed.startsWith('@')) {
        const candidatePath = trimmed.slice(1).trim();
        if (!candidatePath) {
            throw new Error('Expected a file path after @ for --before-script.');
        }
        const absolute = path.isAbsolute(candidatePath) ? candidatePath : path.resolve(candidatePath);
        const hookContents = await readFile(absolute, 'utf8');
        return hookContents.toString();
    }
    return trimmed;
}
export function formatPathForDisplay(value) {
    return value.replace(os.homedir(), '~');
}
function reportError(error) {
    if (error instanceof CommanderError) {
        console.error(error.message);
        return;
    }
    if (error instanceof Error) {
        console.error(error.message);
        return;
    }
    console.error('Unexpected error', error);
}
function normalizeScreenshotMethod(input) {
    if (!input) {
        return 'auto';
    }
    const normalized = input.toLowerCase().trim();
    switch (normalized) {
        case 'auto': {
            return 'auto';
        }
        case 'puppeteer': {
            return 'puppeteer';
        }
        case 'html2canvas':
        case 'html-2-canvas': {
            return 'html2canvas';
        }
        case 'html-to-image':
        case 'htmltoimage':
        case 'dom-to-image':
        case 'domtoimage': {
            return 'html-to-image';
        }
        default: {
            throw new Error('Invalid screenshot method. Use auto, puppeteer, html2canvas, or html-to-image.');
        }
    }
}
async function resolveSmokePrerequisites(params, command) {
    const config = resolveConfig(command);
    const devtoolsConfig = await loadDevToolsConfig();
    if (!devtoolsConfig?.devtoolsUrl) {
        console.error('DevTools endpoint not found. Launch a controlled Chrome window with `pnpm sweetlink open --controlled` first.');
        process.exitCode = 1;
        return null;
    }
    const sessionId = params.sessionHint && params.sessionHint.trim().length > 0
        ? await resolveSessionIdFromHint(params.sessionHint, config)
        : (devtoolsConfig.sessionId ?? null);
    if (!sessionId) {
        console.error('Unable to determine a SweetLink session. Pass --session or rerun `pnpm sweetlink open --controlled`.');
        process.exitCode = 1;
        return null;
    }
    let token;
    try {
        token = await fetchCliToken(config);
    }
    catch (error) {
        console.error('Unable to fetch SweetLink CLI token:', extractEventMessage(error));
        process.exitCode = 1;
        return null;
    }
    const session = await getSessionSummaryById(config, token, sessionId);
    if (!session) {
        console.error(`SweetLink session ${sessionId} was not found. Reopen the controlled window and retry.`);
        process.exitCode = 1;
        return null;
    }
    const baseUrl = new URL(config.appBaseUrl);
    return {
        config,
        devtoolsUrl: devtoolsConfig.devtoolsUrl,
        token,
        sessionId,
        session,
        baseUrl,
    };
}
async function determineSmokeStartIndex(options) {
    if (!options.resume) {
        try {
            await clearSmokeProgress(options.baseOrigin, options.routes);
        }
        catch (error) {
            if (sweetLinkDebug) {
                console.warn('Failed to clear stored smoke progress before run:', error);
            }
        }
        return 0;
    }
    const savedIndex = await loadSmokeProgressIndex(options.baseOrigin, options.routes);
    if (savedIndex === null) {
        console.log('No prior smoke progress found. Starting from the beginning.');
        return 0;
    }
    if (savedIndex >= options.routes.length) {
        console.log('Previous smoke run completed every route. Starting from the beginning.');
        return 0;
    }
    if (savedIndex > 0) {
        const resumeRoute = options.routes[savedIndex];
        console.log(`Resuming smoke test from route #${savedIndex + 1} (${resumeRoute}). Run without --resume to start over.`);
    }
    return Math.max(savedIndex, 0);
}
async function executeSmokeRoute(context, state, route, routeIndex) {
    let { session } = state;
    let lastKnownUrl = state.lastKnownUrl;
    let activeSessionId = context.sessionId;
    const setActiveSessionId = (nextId) => {
        if (!nextId || nextId === activeSessionId) {
            return;
        }
        activeSessionId = nextId;
        context.sessionId = nextId;
    };
    if (route === undefined) {
        return {
            session,
            lastKnownUrl,
            failure: {
                route: `#${routeIndex + 1}`,
                reason: 'Missing route entry in smoke route list.',
            },
        };
    }
    const targetUrl = buildSmokeRouteUrl(context.baseUrl, route);
    const displayPath = `${targetUrl.pathname}${targetUrl.search || ''}`;
    console.log(`\n→ ${displayPath}`);
    const sessionConnected = await ensureSweetLinkSessionConnected({
        config: context.config,
        token: context.token,
        sessionId: activeSessionId,
        devtoolsUrl: context.devtoolsUrl,
        currentUrl: lastKnownUrl,
        timeoutMs: context.timeoutSeconds * 1000,
        onSessionIdChanged: setActiveSessionId,
        candidateUrls: [targetUrl.toString()],
    });
    if (!sessionConnected) {
        console.warn('  Unable to verify active SweetLink session before navigation.');
        return {
            session,
            lastKnownUrl,
            failure: { route: displayPath, reason: 'session unavailable before navigation' },
        };
    }
    const attemptNavigation = async () => {
        await navigateSweetLinkSession({ sessionId: activeSessionId, targetUrl, config: context.config });
    };
    try {
        await attemptNavigation();
    }
    catch (error) {
        const reason = extractEventMessage(error, 'navigation failed');
        if (/session not found|session did not exist|session not available/i.test(reason)) {
            console.warn('  Session went offline during navigation command. Attempting recovery…');
            const recovered = await ensureSweetLinkSessionConnected({
                config: context.config,
                token: context.token,
                sessionId: activeSessionId,
                devtoolsUrl: context.devtoolsUrl,
                currentUrl: lastKnownUrl,
                timeoutMs: context.timeoutSeconds * 1000,
                onSessionIdChanged: setActiveSessionId,
                candidateUrls: [targetUrl.toString()],
            });
            if (recovered) {
                try {
                    await attemptNavigation();
                }
                catch (retryError) {
                    const retryReason = extractEventMessage(retryError, 'navigation failed');
                    console.warn(`  Navigation failed after recovery: ${retryReason}`);
                    return { session, lastKnownUrl, failure: { route: displayPath, reason: retryReason } };
                }
            }
            else {
                console.warn(`  Navigation failed: ${reason}`);
                return { session, lastKnownUrl, failure: { route: displayPath, reason } };
            }
        }
        else {
            console.warn(`  Navigation failed: ${reason}`);
            return { session, lastKnownUrl, failure: { route: displayPath, reason } };
        }
    }
    let handshake = await waitForSweetLinkSession({
        config: context.config,
        token: context.token,
        targetUrl: targetUrl.toString(),
        timeoutSeconds: Math.max(5, context.timeoutSeconds),
        devtoolsUrl: context.devtoolsUrl,
    });
    if (!handshake && context.devtoolsUrl) {
        console.warn('  SweetLink session did not reconnect after navigation. Retrying bootstrap…');
        await triggerSweetLinkCliAuto(context.devtoolsUrl, targetUrl.toString());
        handshake = await waitForSweetLinkSession({
            config: context.config,
            token: context.token,
            targetUrl: targetUrl.toString(),
            timeoutSeconds: Math.max(5, Math.ceil(context.timeoutSeconds / 2)),
            devtoolsUrl: context.devtoolsUrl,
        });
        if (!handshake) {
            const recovered = await ensureSweetLinkSessionConnected({
                config: context.config,
                token: context.token,
                sessionId: activeSessionId,
                devtoolsUrl: context.devtoolsUrl,
                currentUrl: targetUrl.toString(),
                timeoutMs: Math.max(5000, Math.ceil(context.timeoutSeconds * 1000)),
                onSessionIdChanged: setActiveSessionId,
                candidateUrls: [targetUrl.toString()],
            });
            if (recovered) {
                const refreshed = await getSessionSummaryById(context.config, context.token, activeSessionId);
                const recoveredUrl = typeof refreshed?.url === 'string' && refreshed.url.length > 0 ? refreshed.url : targetUrl.toString();
                handshake = {
                    sessionId: activeSessionId,
                    url: recoveredUrl,
                };
            }
        }
    }
    if (!handshake) {
        console.warn('  SweetLink session did not come back online after navigation.');
        return {
            session,
            lastKnownUrl,
            failure: { route: displayPath, reason: 'session did not reconnect' },
        };
    }
    if (handshake.sessionId && handshake.sessionId !== activeSessionId) {
        setActiveSessionId(handshake.sessionId);
    }
    lastKnownUrl = handshake.url ?? targetUrl.toString();
    session = (await getSessionSummaryById(context.config, context.token, activeSessionId)) ?? session;
    const diagnostics = await waitForSmokeRouteReady({
        devtoolsUrl: context.devtoolsUrl,
        targetUrl,
        timeoutMs: context.timeoutSeconds * 1000,
    });
    if (!diagnostics) {
        console.warn('  Timed out waiting for the route to reach a stable state.');
        return { session, lastKnownUrl, failure: { route: displayPath, reason: 'timeout awaiting route readiness' } };
    }
    const finalHref = diagnostics.locationHref ?? 'unknown';
    if (!urlsRoughlyMatch(finalHref, targetUrl.toString())) {
        console.warn(`  Expected ${targetUrl.toString()} but browser reported ${finalHref}.`);
        return {
            session,
            lastKnownUrl,
            failure: { route: displayPath, reason: 'unexpected location after navigation' },
        };
    }
    if (diagnosticsContainBlockingIssues(diagnostics)) {
        console.warn('  Blocking diagnostics detected while loading the route:');
        logBootstrapDiagnostics('Smoke', diagnostics);
        return {
            session,
            lastKnownUrl,
            failure: { route: displayPath, reason: 'runtime diagnostics reported blocking issues' },
        };
    }
    const consoleEvents = await fetchConsoleEvents(context.config, activeSessionId).catch(() => []);
    const newEvents = consoleEvents.filter((event) => !context.seenConsoleIds.has(event.id));
    for (const event of newEvents) {
        context.seenConsoleIds.add(event.id);
    }
    const authEvents = newEvents.filter((event) => consoleEventIndicatesAuthIssue(event));
    if (authEvents.length > 0) {
        console.warn('  Detected authentication failures in the console log:');
        for (const event of authEvents.slice(-5)) {
            console.warn(`    ${formatConsoleEventSummary(event)}`);
        }
        return {
            session,
            lastKnownUrl,
            failure: { route: displayPath, reason: 'authentication failures detected in console output' },
        };
    }
    const runtimeErrorEvents = newEvents.filter((event) => consoleEventIndicatesRuntimeError(event));
    if (runtimeErrorEvents.length > 0) {
        console.warn('  Detected console errors after the route finished loading:');
        for (const event of runtimeErrorEvents.slice(-5)) {
            console.warn(`    ${formatConsoleEventSummary(event)}`);
        }
        return {
            session,
            lastKnownUrl,
            failure: { route: displayPath, reason: 'console errors detected after load' },
        };
    }
    try {
        await saveSmokeProgressIndex(context.baseOrigin, context.routes, routeIndex + 1);
    }
    catch (error) {
        if (sweetLinkDebug) {
            console.warn('Failed to persist smoke progress after route completion:', error);
        }
    }
    console.log('  ✅ Route passed without authentication or runtime errors.');
    return {
        session,
        lastKnownUrl,
        failure: null,
    };
}
async function runSweetLinkSmoke(params, command) {
    const prerequisites = await resolveSmokePrerequisites(params, command);
    if (!prerequisites) {
        return;
    }
    const { config, devtoolsUrl, token, sessionId, session: initialSession, baseUrl } = prerequisites;
    const baseOrigin = baseUrl.origin;
    const startIndex = await determineSmokeStartIndex({
        resume: params.resume,
        routes: params.routes,
        baseOrigin,
    });
    await ensureBackgroundDevtoolsListener({ sessionId, quiet: true });
    const initialConsoleEvents = await fetchConsoleEvents(config, sessionId).catch(() => []);
    const seenConsoleIds = new Set(initialConsoleEvents.map((event) => event.id));
    const remainingRouteCount = params.routes.length - startIndex;
    console.log(`Running SweetLink smoke test across ${remainingRouteCount} route${remainingRouteCount === 1 ? '' : 's'} using session ${formatSessionHeadline(initialSession)}.`);
    if (startIndex > 0) {
        console.log(`Skipping ${startIndex} route${startIndex === 1 ? '' : 's'} that already passed in a previous run.`);
    }
    let lastKnownUrl = initialSession.url ?? baseUrl.toString();
    const context = {
        config,
        token,
        sessionId,
        devtoolsUrl,
        baseUrl,
        baseOrigin,
        routes: params.routes,
        timeoutSeconds: params.timeoutSeconds,
        seenConsoleIds,
    };
    let session = initialSession;
    const failures = [];
    for (let routeIndex = startIndex; routeIndex < params.routes.length; routeIndex += 1) {
        const result = await executeSmokeRoute(context, { session, lastKnownUrl }, params.routes[routeIndex], routeIndex);
        session = result.session;
        lastKnownUrl = result.lastKnownUrl;
        if (result.failure) {
            failures.push(result.failure);
        }
    }
    if (failures.length > 0) {
        console.error(`\nSweetLink smoke test detected issues on ${failures.length} route${failures.length === 1 ? '' : 's'}:`);
        for (const failure of failures) {
            console.error(`  - ${failure.route}: ${failure.reason}`);
        }
        console.error('Review the diagnostics above, fix the auth flow, and rerun `pnpm sweetlink smoke`.');
        if (process.exitCode === undefined || process.exitCode === 0) {
            process.exitCode = 1;
        }
    }
    else {
        try {
            await clearSmokeProgress(baseOrigin, params.routes);
        }
        catch (error) {
            if (sweetLinkDebug) {
                console.warn('Failed to clear smoke progress after successful run:', error);
            }
        }
        console.log('\nSweetLink smoke test passed for all routes.');
    }
}
function extractPathSegments(path) {
    const normalized = trimTrailingSlash(path);
    if (normalized === '/' || normalized.length === 0) {
        return [];
    }
    return normalized.replace(/^\/+/, '').split('/');
}
function suffixSegmentsAllowed(segments) {
    if (segments.length === 0) {
        return true;
    }
    return segments.every((segment) => LOOSE_PATH_SUFFIXES.has(segment));
}
export const __sweetlinkCliTestHelpers = {
    collectChromeCookies,
    normalizePuppeteerCookie,
    buildCookieOrigins,
    prepareChromeLaunch,
    buildWaitCandidateUrls,
    deriveDevtoolsLinkInfo,
    buildClickScript,
};
export { diagnosticsContainBlockingIssues, logBootstrapDiagnostics } from './runtime/devtools';
export { buildClickScript, fetchConsoleEvents, fetchSessionSummaries, formatSessionHeadline, resolvePromptOption, resolveSessionIdFromHint, } from './runtime/session';
function urlsRoughlyMatch(a, b) {
    const urlA = normalizeUrlForMatch(a);
    const urlB = normalizeUrlForMatch(b);
    if (!urlA || !urlB) {
        return a === b;
    }
    if (urlA.origin !== urlB.origin) {
        return false;
    }
    const pathA = trimTrailingSlash(urlA.pathname);
    const pathB = trimTrailingSlash(urlB.pathname);
    if (pathA === pathB) {
        return true;
    }
    const segmentsA = extractPathSegments(pathA);
    const segmentsB = extractPathSegments(pathB);
    const minLength = Math.min(segmentsA.length, segmentsB.length);
    for (let index = 0; index < minLength; index += 1) {
        if (segmentsA[index] !== segmentsB[index]) {
            return false;
        }
    }
    const remainderA = segmentsA.slice(minLength);
    const remainderB = segmentsB.slice(minLength);
    return suffixSegmentsAllowed(remainderA) && suffixSegmentsAllowed(remainderB);
}
async function devtoolsAuthorize(options, command) {
    const devtoolsConfig = await loadDevToolsConfig();
    if (!devtoolsConfig?.devtoolsUrl) {
        console.log('No DevTools session detected. Launch Chrome with `pnpm sweetlink open --controlled` first.');
        return;
    }
    const cliConfig = resolveConfig(command);
    let sessionUrl = options.url?.trim() || undefined;
    if (!sessionUrl) {
        sessionUrl = devtoolsConfig.targetUrl ?? undefined;
    }
    if (!sessionUrl && devtoolsConfig.sessionId) {
        try {
            const token = await fetchCliToken(cliConfig);
            const summary = await getSessionSummaryById(cliConfig, token, devtoolsConfig.sessionId);
            sessionUrl = summary?.url ?? sessionUrl;
        }
        catch {
            /* ignore inability to fetch session summary */
        }
    }
    if (!sessionUrl) {
        try {
            const tabs = await fetchDevToolsTabs(devtoolsConfig.devtoolsUrl);
            const oauthTab = tabs.find((tab) => {
                if (!tab.url) {
                    return false;
                }
                return /oauth|authorize/i.test(tab.url);
            });
            if (oauthTab?.url) {
                sessionUrl = oauthTab.url;
            }
        }
        catch (error) {
            if (sweetLinkDebug) {
                console.warn('Failed to inspect DevTools tabs for authorize command:', error);
            }
        }
    }
    if (!sessionUrl) {
        console.error('Unable to determine which tab contains the OAuth consent screen. Pass --url <authorizeUrl> to override.');
        if (process.exitCode === undefined) {
            process.exitCode = 1;
        }
        return;
    }
    try {
        const result = await attemptTwitterOauthAutoAccept({
            devtoolsUrl: devtoolsConfig.devtoolsUrl,
            sessionUrl,
            scriptPath: cliConfig.oauthScriptPath,
        });
        if (result.handled) {
            console.log(`Authorize prompt handled via ${result.action ?? 'click'}${result.clickedText ? ` (${result.clickedText})` : ''}.`);
        }
        else {
            const reason = result.reason ?? 'no authorize button detected';
            console.log(`Authorize prompt not handled automatically (${reason}).`);
            if (reason === 'requires-login') {
                console.log('Twitter login inputs detected. Complete login manually and rerun the command.');
            }
        }
    }
    catch (error) {
        console.error('Failed to trigger OAuth authorize automation:', extractEventMessage(error));
        if (process.exitCode === undefined) {
            process.exitCode = 1;
        }
    }
}
async function devtoolsStatus(options, command) {
    const config = await loadDevToolsConfig();
    if (!config) {
        console.log('No DevTools session detected. Launch Chrome with `pnpm sweetlink open --controlled` first.');
        return;
    }
    let reachable = false;
    let tabs = [];
    try {
        const response = await fetch(`${config.devtoolsUrl.replace(/\/?$/, '')}/json/version`, { method: 'GET' });
        if (response.ok) {
            reachable = true;
            tabs = await fetchDevToolsTabs(config.devtoolsUrl);
        }
    }
    catch {
        reachable = false;
    }
    const state = await loadDevToolsState();
    let matchedSessionId = state?.sessionId ?? config.sessionId;
    let matchedSessionTitle;
    try {
        const cliConfig = resolveConfig(command);
        if (cliConfig.adminApiKey) {
            const token = await fetchCliToken(cliConfig);
            const sessions = await fetchSessionSummaries(cliConfig, token);
            const match = findBestSessionMatch(sessions, config, matchedSessionId);
            if (match) {
                matchedSessionId = match.sessionId;
                matchedSessionTitle = match.title || undefined;
            }
        }
    }
    catch {
        // Skip session lookup when admin key is unavailable
    }
    const summary = {
        config,
        reachable,
        tabs: tabs.map((tab) => ({ id: tab.id, title: tab.title, url: tab.url, type: tab.type })),
        telemetry: {
            consoleCount: state?.console.length ?? 0,
            networkCount: state?.network.length ?? 0,
            lastUpdated: state?.updatedAt ?? null,
        },
        sessionId: matchedSessionId ?? null,
        sessionTitle: matchedSessionTitle ?? null,
    };
    if (options.json) {
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
        return;
    }
    const reachabilityLabel = reachable ? 'reachable' : 'offline';
    console.log(`DevTools endpoint : ${config.devtoolsUrl} (${reachabilityLabel})`);
    console.log(`Last updated      : ${new Date(config.updatedAt).toISOString()}`);
    if (config.viewport) {
        const dpr = config.viewport.deviceScaleFactor ?? 1;
        console.log(`Viewport          : ${config.viewport.width}x${config.viewport.height} @${dpr}x`);
    }
    console.log(`Tabs              : ${tabs.length}`);
    if (matchedSessionId) {
        console.log(`Linked session    : ${matchedSessionId}${matchedSessionTitle ? ` (${matchedSessionTitle})` : ''}`);
    }
    console.log(`Console buffer    : ${state?.console.length ?? 0} entries`);
    console.log(`Network buffer    : ${state?.network.length ?? 0} entries`);
    if (state?.updatedAt) {
        console.log(`Telemetry updated : ${new Date(state.updatedAt).toISOString()}`);
    }
}
async function devtoolsTabs(options) {
    const config = await loadDevToolsConfig();
    if (!config) {
        console.log('No DevTools session detected. Launch Chrome with `pnpm sweetlink open --controlled` first.');
        return;
    }
    const tabs = await fetchDevToolsTabs(config.devtoolsUrl);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(tabs, null, 2)}\n`);
        return;
    }
    if (tabs.length === 0) {
        console.log('No tabs reported by DevTools.');
        return;
    }
    for (const tab of tabs) {
        console.log(`• ${tab.title || '(untitled)'}`);
        console.log(`  URL : ${tab.url}`);
        console.log(`  ID  : ${tab.id}`);
        if (tab.type) {
            console.log(`  Type: ${tab.type}`);
        }
        console.log('');
    }
}
async function devtoolsShowConsole(options) {
    const state = await loadDevToolsState();
    if (!state || state.console.length === 0) {
        console.log('No console events recorded. Run `pnpm sweetlink devtools listen` to start capturing telemetry.');
        return;
    }
    const tail = Number.isFinite(options.tail) && options.tail > 0 ? Math.floor(options.tail) : 50;
    const entries = state.console.slice(-tail);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
        return;
    }
    for (const entry of entries) {
        const timestamp = new Date(entry.ts).toISOString();
        let location = '';
        if (entry.location?.url) {
            const lineSuffix = entry.location.lineNumber === undefined ? '' : `:${entry.location.lineNumber}`;
            const columnSuffix = entry.location.columnNumber === undefined ? '' : `:${entry.location.columnNumber}`;
            location = ` (${entry.location.url}${lineSuffix}${columnSuffix})`;
        }
        let argsSuffix = '';
        if (entry.args.length > 0) {
            const formattedArgs = [];
            for (const value of entry.args) {
                formattedArgs.push(formatConsoleArg(value));
            }
            argsSuffix = ` ${formattedArgs.join(' ')}`;
        }
        console.log(`[${timestamp}] ${entry.type}: ${entry.text}${argsSuffix}${location}`);
    }
}
async function devtoolsShowNetwork(options) {
    const state = await loadDevToolsState();
    if (!state || state.network.length === 0) {
        console.log('No network entries recorded. Run `pnpm sweetlink devtools listen` to start capturing telemetry.');
        return;
    }
    const tail = Number.isFinite(options.tail) && options.tail > 0 ? Math.floor(options.tail) : 50;
    const entries = state.network.slice(-tail);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
        return;
    }
    for (const entry of entries) {
        const timestamp = new Date(entry.ts).toISOString();
        const status = entry.status === undefined ? (entry.failureText ?? 'failed') : entry.status;
        const type = entry.resourceType ? ` [${entry.resourceType}]` : '';
        console.log(`[${timestamp}] ${entry.method} ${status} ${entry.url}${type}`);
    }
}
async function devtoolsListen(options, command) {
    const background = Boolean(options.background);
    const config = await loadDevToolsConfig();
    if (!config) {
        if (!background) {
            console.log('No DevTools session detected. Launch Chrome with `pnpm sweetlink open --controlled` first.');
        }
        return;
    }
    if (options.reset) {
        try {
            await rm(DEVTOOLS_STATE_PATH, { force: true });
            if (!background) {
                console.log('Cleared cached DevTools telemetry state.');
            }
        }
        catch (error) {
            if (!isErrnoException(error) || error.code !== 'ENOENT') {
                console.warn('Failed to reset DevTools state:', error);
            }
        }
    }
    let state = options.reset ? null : await loadDevToolsState();
    if (!state) {
        state = createEmptyDevToolsState(config.devtoolsUrl);
    }
    state.endpoint = config.devtoolsUrl;
    if (options.reset) {
        // Clearing telemetry is often all we need (e.g. CI smoke calls). Persist the fresh snapshot and
        // exit immediately so `pnpm sweetlink devtools listen --reset` doesn't block waiting for SIGINT.
        try {
            await saveDevToolsState(state);
        }
        catch (error) {
            console.warn('Failed to persist reset DevTools state:', error);
        }
        if (!background) {
            console.log('Reset complete. Re-run without --reset to resume live capture.');
        }
        return;
    }
    const devtoolsState = state;
    devtoolsState.endpoint = config.devtoolsUrl;
    let sessionId = options.session;
    if (sessionId == null) {
        sessionId = await resolveDevToolsSessionId(config, command);
    }
    if (sessionId) {
        devtoolsState.sessionId = sessionId;
        try {
            await saveDevToolsConfig({ devtoolsUrl: config.devtoolsUrl, sessionId });
        }
        catch (error) {
            logDebugError('Failed to persist DevTools session binding', error);
        }
    }
    if (!background) {
        console.log(`Connecting to DevTools at ${config.devtoolsUrl}…`);
    }
    let browser;
    let page;
    try {
        ({ browser, page } = await connectToDevTools(config));
    }
    catch (error) {
        console.error('Failed to connect to the DevTools endpoint:', extractEventMessage(error));
        console.error('Hint: ensure a controlled Chrome window is running via `pnpm sweetlink open --controlled`.');
        process.exitCode = 1;
        return;
    }
    const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
        deviceScaleFactor: window.devicePixelRatio ?? 1,
    }));
    devtoolsState.viewport = viewport;
    try {
        await saveDevToolsConfig({ devtoolsUrl: config.devtoolsUrl, viewport });
    }
    catch (error) {
        logDebugError('Failed to persist DevTools viewport configuration', error);
    }
    const flush = async () => {
        await saveDevToolsState(devtoolsState);
    };
    const scheduleFlush = (() => {
        // Debounce persistence to avoid writing to disk for every console/network event.
        let timer = null;
        return () => {
            if (timer) {
                return;
            }
            timer = setTimeout(() => {
                timer = null;
                void flush().catch((error) => {
                    console.warn('Failed to persist DevTools telemetry:', error);
                });
            }, 300);
        };
    })();
    const attachListeners = (p) => {
        // Capture console and network events for the page and trim buffers as they grow.
        p.on('console', (message) => {
            void (async () => {
                try {
                    const entry = await serializeConsoleMessage(message);
                    devtoolsState.console.push(entry);
                    trimBuffer(devtoolsState.console, DEVTOOLS_CONSOLE_LIMIT);
                    scheduleFlush();
                }
                catch (error) {
                    console.warn('Failed to serialize console message:', error);
                }
            })();
        });
        p.on('requestfinished', (request) => {
            void (async () => {
                try {
                    const response = await request.response();
                    const entry = createNetworkEntryFromRequest(request, response?.status());
                    devtoolsState.network.push(entry);
                    trimBuffer(devtoolsState.network, DEVTOOLS_NETWORK_LIMIT);
                    scheduleFlush();
                }
                catch (error) {
                    console.warn('Failed to process requestfinished event:', error);
                }
            })();
        });
        p.on('requestfailed', (request) => {
            const failure = request.failure();
            const entry = createNetworkEntryFromRequest(request, undefined, failure?.errorText ?? 'failed');
            devtoolsState.network.push(entry);
            trimBuffer(devtoolsState.network, DEVTOOLS_NETWORK_LIMIT);
            scheduleFlush();
        });
    };
    attachListeners(page);
    const context = page.context();
    context.on('page', (newPage) => {
        attachListeners(newPage);
    });
    if (!background) {
        console.log('Listening for console and network events… Press Ctrl+C to stop.');
    }
    const shutdown = async () => {
        try {
            await flush();
        }
        catch (error) {
            if (sweetLinkDebug) {
                console.warn('Failed to flush DevTools state during shutdown.', error);
            }
        }
        try {
            await browser.close();
        }
        catch (error) {
            if (sweetLinkDebug) {
                console.warn('Failed to close DevTools browser during shutdown.', error);
            }
        }
        process.exit(0);
    };
    process.once('SIGINT', () => {
        void shutdown();
    });
    process.once('SIGTERM', () => {
        void shutdown();
    });
    await new Promise(() => {
        /* keep process alive */
    });
}
async function resolveDevToolsSessionId(config, command) {
    try {
        const cliConfig = resolveConfig(command);
        if (!cliConfig.adminApiKey) {
            return config.sessionId;
        }
        const token = await fetchCliToken(cliConfig);
        const sessions = await fetchSessionSummaries(cliConfig, token);
        const match = findBestSessionMatch(sessions, config, config.sessionId);
        return match?.sessionId ?? config.sessionId;
    }
    catch {
        return config.sessionId;
    }
}
function findBestSessionMatch(sessions, config, hint) {
    if (hint) {
        const existing = sessions.find((session) => session.sessionId === hint);
        if (existing) {
            return existing;
        }
    }
    const { targetUrl } = config;
    if (targetUrl) {
        const match = sessions.find((session) => urlsRoughlyMatch(session.url, targetUrl));
        if (match) {
            return match;
        }
    }
    return sessions.length > 0 ? sessions[0] : undefined;
}
//# sourceMappingURL=index.js.map