import { writeFile } from 'node:fs/promises';
import { runCodexImagePrompt, runCodexTextPrompt } from '../codex.js';
import { fetchJson } from '../http.js';
import { describeAppForPrompt } from '../util/app-label.js';
import { extractEventMessage, isErrnoException } from '../util/errors.js';
import { TRAILING_SLASH_PATTERN } from '../util/regex.js';
import { formatConsoleArg } from './devtools.js';
export async function maybeDescribeScreenshot(prompt, imagePath, options = {}) {
    const question = prompt?.trim();
    if (!question) {
        return;
    }
    const appDescription = describeAppForPrompt(options.appLabel);
    const combinedPrompt = `You are analyzing a screenshot from ${appDescription} (treat it like a typical product dashboard). Inspect the image carefully before answering.\nQuestion: ${question}`;
    if (!options.silent) {
        console.log(`Asking Codex about screenshot: ${question}`);
    }
    try {
        const exitCode = await runCodexImagePrompt(imagePath, combinedPrompt);
        if (exitCode !== 0) {
            console.warn(`Codex exited with status ${exitCode}.`);
        }
    }
    catch (error) {
        const message = extractEventMessage(error);
        const missing = isErrnoException(error) && error.code === 'ENOENT';
        const prefix = missing ? 'Codex CLI not found' : `Codex CLI failed: ${message}`;
        console.warn(missing ? `${prefix}; install it or add it to $PATH to use --prompt.` : prefix);
    }
}
export async function maybeAnalyzeConsoleWithPrompt(prompt, selector, events, options = {}) {
    const question = prompt?.trim();
    if (!question) {
        return false;
    }
    const lines = events.length > 0
        ? events.map((event) => {
            const timestamp = new Date(event.timestamp ?? Date.now()).toLocaleTimeString();
            const argsText = event.args && event.args.length > 0 ? event.args.map((value) => formatConsoleArg(value)).join(' ') : '';
            const suffix = argsText.length > 0 ? `: ${argsText}` : '';
            return `[${timestamp}] ${event.level}${suffix}`;
        })
        : ['(no console events were captured after the click)'];
    const appDescription = describeAppForPrompt(options.appLabel);
    const combinedPrompt = `You are analyzing console output from ${appDescription} immediately after triggering a click on selector "${selector}". ` +
        'Review the log lines below (most recent last) and answer the agent’s question.\n\n' +
        `Console output:\n${lines.join('\n')}\n\nQuestion: ${question}`;
    if (!options.silent) {
        console.log(`Asking Codex about console output after ${selector}: ${question}`);
    }
    try {
        const exitCode = await runCodexTextPrompt(combinedPrompt);
        if (exitCode !== 0) {
            console.warn(`Codex exited with status ${exitCode}.`);
            return false;
        }
        return true;
    }
    catch (error) {
        const message = extractEventMessage(error);
        const missing = isErrnoException(error) && error.code === 'ENOENT';
        const prefix = missing ? 'Codex CLI not found' : `Codex CLI failed: ${message}`;
        console.warn(missing ? `${prefix}; install it or add it to $PATH to use --prompt.` : prefix);
        return false;
    }
}
export async function tryHtmlToImageFallback(context) {
    const { rendererOverride, failureReason, config, token, sessionId, payload, outputPath, prompt, suppressOutput } = context;
    console.warn(`Requested renderer "${rendererOverride}" failed: ${failureReason ?? 'Unknown error'}`);
    console.warn('Falling back to html-to-image renderer…');
    const fallbackResponse = await fetchJson(`${config.daemonBaseUrl}/sessions/${encodeURIComponent(sessionId)}/command`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...payload, renderer: 'html-to-image' }),
    });
    const fallbackResult = fallbackResponse.result;
    if (!fallbackResult.ok) {
        console.error('Fallback html-to-image renderer also failed.');
        return { handled: false, fallbackResult };
    }
    await persistScreenshotResult(outputPath, fallbackResult, { silent: suppressOutput });
    await maybeDescribeScreenshot(prompt, outputPath, { silent: suppressOutput, appLabel: config.appLabel });
    return { handled: true };
}
export async function attemptDevToolsCapture(options) {
    const { devtoolsUrl, sessionUrl, selector, quality, mode, outputPath } = options;
    const normalizedUrl = devtoolsUrl.replace(TRAILING_SLASH_PATTERN, '');
    try {
        const versionResponse = await fetch(`${normalizedUrl}/json/version`, { method: 'GET' });
        if (!versionResponse.ok) {
            return null;
        }
    }
    catch {
        return null;
    }
    let puppeteer;
    try {
        ({ default: puppeteer } = await import('puppeteer'));
    }
    catch (error) {
        console.warn('Puppeteer is unavailable:', error);
        return null;
    }
    const browser = await puppeteer.connect({ browserURL: normalizedUrl, defaultViewport: null, protocolTimeout: 5000 });
    try {
        const pages = await browser.pages();
        const sessionUrlObj = new URL(sessionUrl);
        const target = pages.find((page) => page.url() === sessionUrl) ||
            pages.find((page) => page.url()?.startsWith(sessionUrlObj.origin));
        if (!target) {
            return null;
        }
        await target.bringToFront();
        const jpegQuality = Math.min(100, Math.max(1, Math.round(quality * 100)));
        let buffer;
        let width = 0;
        let height = 0;
        if (selector) {
            await target.waitForSelector(selector, { timeout: 10_000 });
            const element = await target.$(selector);
            if (!element) {
                throw new Error(`Selector ${selector} not found in target page`);
            }
            const box = await element.boundingBox();
            const raw = (await element.screenshot({ type: 'jpeg', quality: jpegQuality }));
            await writeFile(outputPath, raw, { mode: 0o600 });
            buffer = raw;
            width = box ? Math.round(box.width) : 0;
            height = box ? Math.round(box.height) : 0;
        }
        else if (mode === 'full') {
            const raw = (await target.screenshot({
                type: 'jpeg',
                quality: jpegQuality,
                fullPage: true,
            }));
            await writeFile(outputPath, raw, { mode: 0o600 });
            buffer = raw;
            const dims = await target.evaluate(() => ({
                width: document.documentElement.scrollWidth,
                height: document.documentElement.scrollHeight,
            }));
            width = Math.round(dims.width);
            height = Math.round(dims.height);
        }
        else {
            const clip = await target.evaluate(() => {
                const explicit = document.querySelector('[data-sweetlink-target="top-posters-card"]');
                const cards = explicit ? [explicit] : [...document.querySelectorAll('div.col-span-1')];
                const targetCard = cards.find((card) => [...card.querySelectorAll('span, h2, h3')].some((node) => (node.textContent || '').trim().toLowerCase() === 'top posters'));
                if (!targetCard) {
                    return null;
                }
                targetCard.scrollIntoView({ behavior: 'auto', block: 'center' });
                const rect = targetCard.getBoundingClientRect();
                return {
                    x: Math.max(0, Math.floor(rect.left) - 8),
                    y: Math.max(0, Math.floor(rect.top) - 8),
                    width: Math.ceil(rect.width) + 16,
                    height: Math.ceil(rect.height) + 16,
                };
            });
            if (!clip) {
                throw new Error('Unable to locate Top Posters card in target tab');
            }
            const raw = (await target.screenshot({ type: 'jpeg', quality: jpegQuality, clip }));
            await writeFile(outputPath, raw, { mode: 0o600 });
            buffer = raw;
            width = Math.round(clip.width);
            height = Math.round(clip.height);
        }
        return {
            width,
            height,
            sizeKb: buffer.length / 1024,
            renderer: 'puppeteer',
        };
    }
    catch (error) {
        console.warn('DevTools capture failed:', error instanceof Error ? error.message : error);
        return null;
    }
    finally {
        await browser.disconnect();
    }
}
export async function tryDevToolsRecovery(context) {
    const { sessionUrl, devtoolsUrl, selector, quality, mode, outputPath, prompt, suppressOutput, logInfo, failureReason, } = context;
    if (!sessionUrl) {
        return false;
    }
    const devtoolsFallback = await attemptDevToolsCapture({
        devtoolsUrl,
        outputPath,
        sessionUrl,
        selector,
        quality,
        mode,
    });
    if (!devtoolsFallback) {
        console.warn('Puppeteer fallback did not succeed; showing original renderer error.');
        return false;
    }
    const reason = failureReason ?? 'unknown error';
    logInfo(`Renderer failure (${reason}) recovered via Puppeteer fallback (${devtoolsFallback.width}x${devtoolsFallback.height}, ${devtoolsFallback.sizeKb.toFixed(1)} KB).`);
    if (!suppressOutput) {
        console.log(`Saved screenshot to ${outputPath} (${devtoolsFallback.width}x${devtoolsFallback.height}, ${devtoolsFallback.sizeKb.toFixed(1)} KB, method: ${devtoolsFallback.renderer}).`);
    }
    await maybeDescribeScreenshot(prompt, outputPath, { silent: suppressOutput, appLabel: context.appLabel });
    return true;
}
export async function persistScreenshotResult(outputPath, result, options = {}) {
    if (!result.ok) {
        throw new Error(result.error ?? 'Screenshot command failed');
    }
    const data = result.data;
    if (!data || typeof data.base64 !== 'string') {
        throw new Error('Screenshot succeeded but no image payload was returned.');
    }
    const buffer = Buffer.from(data.base64, 'base64');
    await writeFile(outputPath, buffer, { mode: 0o600 });
    const sizeInKb = buffer.length / 1024;
    if (!options.silent) {
        console.log(`Saved screenshot to ${outputPath} (${data.width}x${data.height}, ${sizeInKb.toFixed(1)} KB, method: ${data.renderer}).`);
    }
    return data;
}
//# sourceMappingURL=screenshot.js.map