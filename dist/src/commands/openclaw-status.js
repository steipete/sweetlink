import { OpenClawClient } from '../openclaw/client.js';
import { resolveOpenClawConfig } from '../openclaw/config.js';
/** Sanitize URL for display — removes credentials to prevent leakage. */
function sanitizeUrlForDisplay(url) {
    try {
        const parsed = new URL(url);
        parsed.username = '';
        parsed.password = '';
        return parsed.toString();
    }
    catch {
        return '(invalid URL)';
    }
}
export function registerOpenClawStatusCommand(program) {
    program
        .command('openclaw-status')
        .description('Check connectivity to the OpenClaw browser control server')
        .action(async function () {
        const ocConfig = resolveOpenClawConfig();
        if (!ocConfig.enabled) {
            console.log('OpenClaw integration is not enabled.');
            console.log('To enable, add { "openclaw": { "enabled": true } } to sweetlink.json');
            console.log('or set SWEETLINK_OPENCLAW_URL.');
            return;
        }
        console.log(`OpenClaw server: ${sanitizeUrlForDisplay(ocConfig.url)}`);
        console.log(`Profile: ${ocConfig.profile}`);
        try {
            const client = new OpenClawClient(ocConfig);
            const health = await client.health({ skipCache: true });
            console.log(`Running: ${health.running}`);
            console.log(`CDP ready: ${health.cdpReady}`);
            if (health.running && health.cdpReady) {
                console.log('OpenClaw is ready.');
            }
            else {
                console.log('OpenClaw is not fully ready. Check that the browser is launched.');
                process.exitCode = 1;
            }
        }
        catch (error) {
            console.error('Failed to connect to OpenClaw:', error instanceof Error ? error.message : String(error));
            console.error('Hint: ensure OpenClaw is running (`openclaw browser launch`).');
            process.exitCode = 1;
        }
    });
}
//# sourceMappingURL=openclaw-status.js.map