import type { IncomingMessage, ServerResponse } from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { defineConfig, type PluginOption } from 'vite';
import { issueSweetLinkHandshake, resolveDaemonUrl } from './server/handshake.js';

async function handleHandshakeRequest(_req: unknown, res: ServerResponse) {
  try {
    const payload = await issueSweetLinkHandshake();
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: message }));
  }
}

async function handleStatusRequest(_req: IncomingMessage, res: ServerResponse) {
  const daemonUrl = resolveDaemonUrl();
  const tlsProbe = await probeDaemonTls(daemonUrl);
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
          resolveOnce({ reachable: true, tlsTrusted: true, message: `status ${response.statusCode ?? 0}` });
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
        resolveOnce({ reachable: false, tlsTrusted: false, message: error.message });
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

function sweetLinkHandshakePlugin(): PluginOption {
  return {
    name: 'sweetlink-handshake',
    configureServer(server) {
      server.middlewares.use('/api/sweetlink/handshake', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        void handleHandshakeRequest(req, res);
      });
      server.middlewares.use('/api/sweetlink/status', (req, res, next) => {
        if (req.method !== 'GET') {
          next();
          return;
        }
        void handleStatusRequest(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/sweetlink/handshake', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        void handleHandshakeRequest(req, res);
      });
      server.middlewares.use('/api/sweetlink/status', (req, res, next) => {
        if (req.method !== 'GET') {
          next();
          return;
        }
        void handleStatusRequest(req, res);
      });
    },
  };
}

export default defineConfig({
  server: {
    port: 4000,
    strictPort: true,
  },
  preview: {
    port: 4000,
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  resolve: {
    alias: [
      {
        find: 'sweetlink/runtime/browser',
        replacement: path.resolve(import.meta.dirname, '../../src/runtime/browser/index.ts'),
      },
    ],
  },
  plugins: [sweetLinkHandshakePlugin()],
});
