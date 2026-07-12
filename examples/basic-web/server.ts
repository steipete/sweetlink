import { promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContentSecurityPolicy } from './server/csp.js';
import { issueSweetLinkHandshake, resolveDaemonUrl } from './server/handshake.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDirectory = path.resolve(__dirname, '../client');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  routeRequest(req, res).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console -- provide feedback for demo operators
    console.error('Unexpected error handling request', message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: message }));
  });
});

const port = resolveExamplePort();

server.listen(port, () => {
  // eslint-disable-next-line no-console -- provide feedback for demo operators
  console.log(`SweetLink demo available at http://localhost:${port}`);
  // eslint-disable-next-line no-console -- provide feedback for demo operators
  console.log(`POST http://localhost:${port}/api/sweetlink/handshake to request a session.`);
});

async function routeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';
  const strippedUrl = stripQuery(url);
  if (method === 'POST' && strippedUrl === '/api/sweetlink/handshake') {
    await handleHandshake(res);
    return;
  }
  if (method === 'GET' && strippedUrl === '/api/sweetlink/status') {
    await handleStatus(res);
    return;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD, POST');
    res.end();
    return;
  }

  await serveStaticAsset(url, method === 'HEAD', res);
}

async function handleHandshake(res: ServerResponse): Promise<void> {
  try {
    const payload = await issueSweetLinkHandshake();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: message }));
  }
}

async function handleStatus(res: ServerResponse): Promise<void> {
  const daemonUrl = resolveDaemonUrl();
  const tlsProbe = await probeDaemonTls(daemonUrl);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      daemonUrl,
      reachable: tlsProbe.reachable,
      tlsTrusted: tlsProbe.tlsTrusted,
      message: tlsProbe.message ?? null,
    })
  );
}

async function serveStaticAsset(url: string, headOnly: boolean, res: ServerResponse): Promise<void> {
  const sanitizedPath = sanitizePath(stripQuery(url));
  const requestedPath = sanitizedPath === '/' ? 'index.html' : sanitizedPath.slice(1);
  const candidate = path.join(clientDirectory, requestedPath);
  const resolved = await resolveFilePath(candidate);

  if (!resolved) {
    await serveFile(path.join(clientDirectory, 'index.html'), 'text/html; charset=utf-8', headOnly, res, 200);
    return;
  }

  const mimeType = MIME_TYPES[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream';
  await serveFile(resolved, mimeType, headOnly, res, 200);
}

async function resolveFilePath(candidate: string): Promise<string | null> {
  try {
    const stat = await fs.stat(candidate);
    if (stat.isDirectory()) {
      const indexCandidate = path.join(candidate, 'index.html');
      const indexStat = await fs.stat(indexCandidate);
      return indexStat.isFile() ? indexCandidate : null;
    }
    return stat.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

async function serveFile(
  filePath: string,
  mimeType: string,
  headOnly: boolean,
  res: ServerResponse,
  status: number
): Promise<void> {
  try {
    const data = headOnly ? null : await fs.readFile(filePath);
    res.statusCode = status;
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', buildContentSecurityPolicy(resolveDaemonUrl()));
    if (headOnly) {
      res.end();
    } else {
      res.end(data);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console -- provide feedback for demo operators
    console.warn('Failed to serve asset', filePath, message);
    res.statusCode = 404;
    res.end('Not found');
  }
}

function stripQuery(url: string): string {
  const index = url.indexOf('?');
  if (index === -1) {
    return url;
  }
  return url.slice(0, index);
}

function sanitizePath(urlPath: string): string {
  const normalized = path.posix.normalize(urlPath);
  if (!normalized.startsWith('/')) {
    return `/${normalized}`;
  }
  return normalized;
}

function resolveExamplePort(): number {
  const explicitPort = readEnvString('PORT');
  if (explicitPort) {
    const candidate = Number(explicitPort);
    if (Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }

  const appUrl = readEnvString('SWEETLINK_APP_URL');
  if (appUrl) {
    try {
      const parsed = new URL(appUrl);
      if (parsed.port) {
        const candidate = Number(parsed.port);
        if (Number.isFinite(candidate) && candidate > 0) {
          return candidate;
        }
      }
    } catch {
      // ignore parsing failures and fall back to the demo default
    }
  }

  return 4000;
}

function readEnvString(key: string): string | null {
  // biome-ignore lint/style/noProcessEnv: demo app reads raw env for configurability
  const raw = process.env[key];
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function probeDaemonTls(
  targetUrl: string
): Promise<{ reachable: boolean; tlsTrusted: boolean; message?: string }> {
  return await new Promise((resolve) => {
    let settled = false;
    const resolveOnce = (value: { reachable: boolean; tlsTrusted: boolean; message?: string }) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    try {
      const request = https.request(
        targetUrl,
        {
          method: 'HEAD',
          rejectUnauthorized: true,
          timeout: 5000,
        },
        (response) => {
          response.resume();
          resolveOnce({
            reachable: true,
            tlsTrusted: true,
            message: `status ${response.statusCode ?? 0}`,
          });
        }
      );

      request.on('error', (error: NodeJS.ErrnoException) => {
        const tlsErrors = new Set([
          'DEPTH_ZERO_SELF_SIGNED_CERT',
          'SELF_SIGNED_CERT_IN_CHAIN',
          'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
          'ERR_TLS_CERT_ALTNAME_INVALID',
        ]);
        if (error.code && tlsErrors.has(error.code)) {
          resolveOnce({ reachable: true, tlsTrusted: false, message: error.message });
          return;
        }
        resolveOnce({
          reachable: false,
          tlsTrusted: false,
          message: error.message,
        });
      });

      request.on('timeout', () => {
        request.destroy(new Error('Request timed out'));
      });

      request.end();
    } catch (error) {
      resolveOnce({
        reachable: false,
        tlsTrusted: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
