import type { Page as PuppeteerPage } from 'puppeteer';
import type {
  SweetLinkOauthAuthorizeContext,
  SweetLinkOauthAutomation,
  TwitterOauthAutoAcceptResult,
} from '../../src/runtime/devtools/types';

const BUTTON_TEXTS = ['authorize app', 'allow', 'authorize', 'accept'];
const BUTTON_TEST_IDS = [
  'oauthauthorizebutton',
  'oauth-allow',
  'oauth-authorize',
  'oauth-approve',
  'authorizeappbutton',
  'app-bar-allow-button',
  'allow',
  'approve',
  'oauth_consent_button',
];
const USERNAME_SELECTORS = [
  'input[name="text"]',
  'input[autocomplete="username"]',
  'input[data-testid="LoginForm_User_Field"]',
];
const PASSWORD_SELECTORS = ['input[type="password"]', 'input[data-testid="LoginForm_Password_Field"]'];
const FORM_SELECTORS = ['form[action*="oauth" i]', 'form[action*="authorize" i]', 'form[action*="oauth/authorize" i]'];

const EVALUATION_SCRIPT = (() => {
  const serialized = JSON.stringify({
    buttonTexts: BUTTON_TEXTS,
    buttonTestIds: BUTTON_TEST_IDS,
    usernameSelectors: USERNAME_SELECTORS,
    passwordSelectors: PASSWORD_SELECTORS,
    formSelectors: FORM_SELECTORS,
  });
  return `(() => {
    const config = ${serialized};
    const buttonTexts = config.buttonTexts;
    const buttonTestIds = config.buttonTestIds.map((value) => value.toLowerCase());
    const usernameSelectors = config.usernameSelectors;
    const passwordSelectors = config.passwordSelectors;
    const formSelectors = config.formSelectors;

    const host = location.hostname.toLowerCase();
    const result = {
      url: location.href,
      host,
      handled: false,
      reason: null,
      action: null,
      clickedText: null,
      hasUsernameInput: false,
      hasPasswordInput: false,
    };
    const isTwitterHost = host.endsWith('twitter.com') || host.endsWith('x.com');
    if (!isTwitterHost) {
      result.reason = 'not-twitter';
      return result;
    }
    if (usernameSelectors.some((selector) => document.querySelector(selector)) ||
        passwordSelectors.some((selector) => document.querySelector(selector))) {
      result.reason = 'requires-login';
      result.hasUsernameInput = usernameSelectors.some((selector) => document.querySelector(selector));
      result.hasPasswordInput = passwordSelectors.some((selector) => document.querySelector(selector));
      return result;
    }
    const isMatch = (element) => {
      if (!element) {
        return false;
      }
      const testId = (element.getAttribute?.('data-testid') ?? '').trim().toLowerCase();
      if (testId && buttonTestIds.includes(testId)) {
        return true;
      }
      const text = (element.textContent || '').trim().toLowerCase();
      if (text.length === 0 && element.tagName === 'INPUT') {
        const value = (element.value || '').trim().toLowerCase();
        return buttonTexts.includes(value);
      }
      return buttonTexts.includes(text);
    };

    const buttonElements = [
      ...document.querySelectorAll('button, div[role="button"], a[role="button"], input[type="submit"]'),
    ];
    let target = buttonElements.find((candidate) => isMatch(candidate)) || null;
    if (!target) {
      const forms = formSelectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
      let fallbackForm = null;
      for (const form of forms) {
        const submitCandidate = form.querySelector('button, input[type="submit"], div[role="button"], a[role="button"]');
        if (isMatch(submitCandidate)) {
          target = submitCandidate;
          break;
        }
        if (!fallbackForm) {
          fallbackForm = form;
        }
      }
      if (!target && fallbackForm) {
        target = fallbackForm;
      }
    }

    if (!target) {
      result.reason = 'button-not-found';
      return result;
    }

    const clickable = target;
    const parentForm = typeof clickable.closest === 'function' ? clickable.closest('form') : null;

    if (typeof clickable.click === 'function') {
      try {
        clickable.click();
        const raw = (clickable.textContent ?? clickable.value ?? '').trim();
        result.handled = true;
        result.action = 'click';
        result.clickedText = raw || null;
        return result;
      } catch {}
    }

    try {
      const ownerView = clickable.ownerDocument?.defaultView ?? undefined;
      const synthetic = new MouseEvent('click', { bubbles: true, cancelable: true, view: ownerView });
      if (clickable.dispatchEvent(synthetic)) {
        const raw = (clickable.textContent ?? clickable.value ?? '').trim();
        result.handled = true;
        result.action = 'dispatch-event';
        result.clickedText = raw || null;
        return result;
      }
    } catch {}

    if (parentForm) {
      try {
        if (typeof parentForm.requestSubmit === 'function') {
          parentForm.requestSubmit(clickable instanceof HTMLButtonElement ? clickable : undefined);
        } else {
          parentForm.submit();
        }
        const raw = (clickable.textContent ?? clickable.value ?? '').trim();
        result.handled = true;
        result.action = 'form-submit';
        result.clickedText = raw || null;
        return result;
      } catch {}
    }

    result.reason = 'button-not-clickable';
    return result;
  })()`;
})();

const oauthAutomation: SweetLinkOauthAutomation = {
  async authorize(context) {
    const candidates = await collectCandidateUrls(context);
    let lastResult: TwitterOauthAutoAcceptResult = { handled: false, reason: 'button-not-found' };

    for (const candidate of candidates) {
      const evaluation = await evaluateAuthorizePrompt(context, candidate);
      if (!evaluation) {
        continue;
      }
      if (evaluation.handled || evaluation.reason === 'requires-login') {
        return evaluation;
      }
      lastResult = evaluation;
    }

    const puppeteerResult = await authorizeWithPuppeteer(context, candidates);
    if (puppeteerResult) {
      if (puppeteerResult.handled || puppeteerResult.reason === 'requires-login') {
        return puppeteerResult;
      }
      lastResult = puppeteerResult;
    }

    return lastResult;
  },
};

export default oauthAutomation;

async function collectCandidateUrls(context: SweetLinkOauthAuthorizeContext): Promise<string[]> {
  const urls = new Set<string>([context.sessionUrl]);
  try {
    const tabs = await context.fetchTabs(context.devtoolsUrl);
    for (const tab of tabs) {
      if (!tab?.url) {
        continue;
      }
      const lowerUrl = tab.url.toLowerCase();
      if (
        context.urlsRoughlyMatch(tab.url, context.sessionUrl) ||
        lowerUrl.includes('oauth') ||
        lowerUrl.includes('authorize')
      ) {
        urls.add(tab.url);
      }
    }
  } catch (error) {
    context.logDebugError('OAuth automation: failed to inspect DevTools tabs', error);
  }
  return [...urls];
}

async function evaluateAuthorizePrompt(
  context: SweetLinkOauthAuthorizeContext,
  targetUrl: string
): Promise<TwitterOauthAutoAcceptResult | null> {
  try {
    const raw = await context.evaluateInDevToolsTab(targetUrl, EVALUATION_SCRIPT);
    return normalizeEvaluationResult(raw);
  } catch (error) {
    context.logDebugError('OAuth automation: evaluation failed', error);
    return null;
  }
}

async function authorizeWithPuppeteer(
  context: SweetLinkOauthAuthorizeContext,
  candidateUrls: readonly string[]
): Promise<TwitterOauthAutoAcceptResult | null> {
  const browser = await context.connectPuppeteer();
  if (!browser) {
    return null;
  }

  try {
    const pages = await browser.pages();
    if (pages.length === 0) {
      return null;
    }

    const candidatePages = pages.filter((page) => {
      const url = page.url();
      if (!url) {
        return false;
      }
      const lowerUrl = url.toLowerCase();
      return (
        candidateUrls.some((candidate) => context.urlsRoughlyMatch(url, candidate)) ||
        lowerUrl.includes('oauth') ||
        lowerUrl.includes('authorize')
      );
    });

    const pagesToInspect = candidatePages.length > 0 ? candidatePages : pages;
    let lastResult: TwitterOauthAutoAcceptResult | null = null;

    for (const page of pagesToInspect) {
      try {
        await context.waitForPageReady(page);
      } catch {
        // ignore readiness failures
      }

      const pageResult = await authorizeInPuppeteerPage(context, page);
      if (!pageResult) {
        continue;
      }

      if (pageResult.handled) {
        try {
          await Promise.race([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => null),
            context.delay(1500),
          ]);
        } catch {
          /* ignore navigation waits */
        }
        return pageResult;
      }

      lastResult = pageResult;
      if (pageResult.reason === 'requires-login') {
        return lastResult;
      }
    }

    return lastResult;
  } catch (error) {
    context.logDebugError('OAuth automation: unexpected Puppeteer failure', error);
    return null;
  } finally {
    try {
      await browser.disconnect();
    } catch {
      /* ignore disconnect errors */
    }
  }
}

async function authorizeInPuppeteerPage(
  context: SweetLinkOauthAuthorizeContext,
  page: PuppeteerPage
): Promise<TwitterOauthAutoAcceptResult | null> {
  const frames = page.frames();
  let lastResult: TwitterOauthAutoAcceptResult | null = null;

  for (const frame of frames) {
    let frameResult: TwitterOauthAutoAcceptResult | null = null;
    try {
      frameResult = normalizeEvaluationResult(await frame.evaluate(EVALUATION_SCRIPT));
    } catch (error) {
      context.logDebugError('OAuth automation: frame evaluation failed', error);
    }

    if (!frameResult) {
      continue;
    }

    if (frameResult.handled) {
      return frameResult;
    }

    lastResult = frameResult;
    if (frameResult.reason === 'requires-login') {
      return lastResult;
    }
  }

  return lastResult;
}

function normalizeEvaluationResult(value: unknown): TwitterOauthAutoAcceptResult | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.handled !== 'boolean') {
    return null;
  }
  return {
    handled: record.handled,
    action: typeof record.action === 'string' ? record.action : undefined,
    reason: typeof record.reason === 'string' ? record.reason : undefined,
    clickedText: typeof record.clickedText === 'string' || record.clickedText === null ? record.clickedText : undefined,
    hasUsernameInput: record.hasUsernameInput === true,
    hasPasswordInput: record.hasPasswordInput === true,
  };
}
