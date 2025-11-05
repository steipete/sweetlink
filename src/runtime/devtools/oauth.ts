import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { logDebugError } from '../../util/errors';
import { delay } from '../../util/time';
import {
  connectPuppeteerBrowser,
  navigatePuppeteerPage,
  resolvePuppeteerPage,
  waitForPageReady,
} from '../chrome/puppeteer';
import { urlsRoughlyMatch } from '../url';
import { evaluateInDevToolsTab, fetchDevToolsTabsWithRetry } from './cdp';
import type { SweetLinkOauthAuthorizeContext, SweetLinkOauthAutomation, TwitterOauthAutoAcceptResult } from './types';

interface AttemptOauthAutomationParameters {
  devtoolsUrl: string;
  sessionUrl: string;
  scriptPath: string | null;
}

interface LoadedAutomation {
  path: string;
  automation: SweetLinkOauthAutomation;
}

let cachedAutomation: LoadedAutomation | null = null;
const warnedMissingScriptPaths = new Set<string | null>();

export async function attemptTwitterOauthAutoAccept({
  devtoolsUrl,
  sessionUrl,
  scriptPath,
}: AttemptOauthAutomationParameters): Promise<TwitterOauthAutoAcceptResult> {
  const automation = await loadOauthAutomation(scriptPath);
  if (!automation) {
    if (!warnedMissingScriptPaths.has(scriptPath ?? null)) {
      const message = scriptPath
        ? `[sweetlink] OAuth automation script not found at "${scriptPath}". Auto-authorize is disabled.`
        : '[sweetlink] No OAuth automation script configured. Auto-authorize is disabled.';
      console.warn(message);
      warnedMissingScriptPaths.add(scriptPath ?? null);
    }
    return { handled: false, reason: scriptPath ? 'oauth-handler-not-found' : 'oauth-handler-not-configured' };
  }

  const context: SweetLinkOauthAuthorizeContext = {
    devtoolsUrl,
    sessionUrl,
    fetchTabs: (overrideUrl) => fetchDevToolsTabsWithRetry(overrideUrl ?? devtoolsUrl),
    evaluateInDevToolsTab: async (targetUrl, expression) => evaluateInDevToolsTab(devtoolsUrl, targetUrl, expression),
    urlsRoughlyMatch,
    connectPuppeteer: async (attempts = 3) => {
      try {
        const { default: puppeteer } = await import('puppeteer');
        return await connectPuppeteerBrowser(puppeteer, devtoolsUrl, attempts);
      } catch (error) {
        logDebugError('Unable to load Puppeteer for OAuth automation', error);
        return null;
      }
    },
    resolvePuppeteerPage,
    navigatePuppeteerPage,
    waitForPageReady,
    delay,
    logDebugError,
  };

  try {
    const rawResult = await automation.authorize(context);
    return normalizeAutomationResult(rawResult);
  } catch (error) {
    logDebugError('OAuth automation script threw an error', error);
    return { handled: false, reason: 'oauth-handler-error' };
  }
}

async function loadOauthAutomation(scriptPath: string | null): Promise<SweetLinkOauthAutomation | null> {
  if (!scriptPath) {
    return null;
  }

  const resolvedPath = path.isAbsolute(scriptPath) ? scriptPath : path.resolve(process.cwd(), scriptPath);
  if (cachedAutomation && cachedAutomation.path === resolvedPath) {
    return cachedAutomation.automation;
  }

  try {
    const moduleUrl = pathToFileURL(resolvedPath).href;
    const imported = await import(moduleUrl);
    const automation = normalizeAutomationModule(imported);
    if (!automation) {
      console.warn(
        `[sweetlink] OAuth automation script "${resolvedPath}" does not export an authorize(context) function.`
      );
      return null;
    }
    cachedAutomation = { path: resolvedPath, automation };
    return automation;
  } catch (error) {
    console.warn(
      `[sweetlink] Failed to load OAuth automation script "${resolvedPath}":`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

function normalizeAutomationModule(candidate: unknown): SweetLinkOauthAutomation | null {
  if (!candidate) {
    return null;
  }
  if (isAutomation(candidate)) {
    return candidate;
  }
  if (typeof candidate === 'object') {
    const record = candidate as Record<string, unknown>;
    if (isAutomation(record.default)) {
      return record.default;
    }
    if (isAutomation(record.automation)) {
      return record.automation;
    }
    if (typeof record.authorize === 'function') {
      return { authorize: record.authorize as SweetLinkOauthAutomation['authorize'] };
    }
  }
  if (typeof candidate === 'function') {
    const fn = candidate as SweetLinkOauthAutomation['authorize'];
    return {
      authorize: (context) => Promise.resolve(fn(context)),
    };
  }
  return null;
}

function isAutomation(value: unknown): value is SweetLinkOauthAutomation {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.authorize === 'function';
}

function normalizeAutomationResult(value: unknown): TwitterOauthAutoAcceptResult {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.handled === 'boolean') {
      return {
        handled: record.handled,
        action: typeof record.action === 'string' ? record.action : undefined,
        reason: typeof record.reason === 'string' ? record.reason : undefined,
        clickedText:
          typeof record.clickedText === 'string' || record.clickedText === null ? record.clickedText : undefined,
        hasUsernameInput: record.hasUsernameInput === true,
        hasPasswordInput: record.hasPasswordInput === true,
      };
    }
  }
  return { handled: false, reason: 'oauth-handler-invalid-result' };
}
