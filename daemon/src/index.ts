#!/usr/bin/env node

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createHttpsServer, request as httpsRequest } from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { URL } from 'node:url';
import {
  createSweetLinkCommandId,
  SWEETLINK_DEFAULT_PORT,
  SWEETLINK_HEARTBEAT_INTERVAL_MS,
  SWEETLINK_HEARTBEAT_TOLERANCE_MS,
  SWEETLINK_WS_PATH,
  type SweetLinkCommandResult,
  type SweetLinkConsoleEvent,
  type SweetLinkSessionSummary,
  verifySweetLinkToken,
} from '@sweetlink/shared';
import { readSweetLinkEnv } from '@sweetlink/shared/env';
import {
  getDefaultSweetLinkSecretPath,
  resolveSweetLinkSecret,
  type SweetLinkSecretResolution,
} from '@sweetlink/shared/node';
import WebSocket, { WebSocketServer } from 'ws';
import { z } from 'zod';
import { generateSessionCodename } from './codename.js';

const SHUTDOWN_GRACE_MS = 1000;

type TimerHandle = ReturnType<typeof setTimeout>;

const unrefTimer = (handle: TimerHandle): void => {
  const candidate: unknown = handle;
  if (typeof candidate === 'object' && candidate !== null && 'unref' in candidate) {
    const unref = (candidate as { unref?: () => void }).unref;
    if (typeof unref === 'function') {
      unref.call(candidate);
    }
  }
};

const toError = (value: unknown): Error => {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return Object.assign(new Error(value), { cause: value });
  }
  if (value && typeof value === 'object' && 'message' in (value as { message?: unknown })) {
    const candidate = (value as { message?: unknown }).message;
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return Object.assign(new Error(candidate.trim()), { cause: value });
    }
  }
  return Object.assign(new Error('Unknown error'), { cause: value });
};

const getErrorMessage = (value: unknown): string => {
  const error = toError(value);
  return error.message || 'Unknown error';
};

interface PendingCommand {
  readonly commandId: string;
  readonly resolve: (result: CommandResult) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: TimerHandle;
}

interface SessionEntry {
  readonly metadata: SessionMetadata;
  readonly socket: WebSocket;
  lastHeartbeat: number;
  readonly consoleBuffer: ConsoleEvent[];
  readonly pending: Map<string, PendingCommand>;
  lastConsoleEventAt: number | null;
}

const CERT_DIR = path.join(os.homedir(), '.sweetlink', 'certs');
const CERT_PATH = path.join(CERT_DIR, 'localhost-cert.pem');
const KEY_PATH = path.join(CERT_DIR, 'localhost-key.pem');
const SOCKET_STATE_LABEL: Record<number, 'connecting' | 'open' | 'closing' | 'closed'> = {
  0: 'connecting',
  1: 'open',
  2: 'closing',
  3: 'closed',
};

const SweetLinkConsoleLevelSchema = z.enum(['log', 'info', 'warn', 'error', 'debug']);

const consoleEventSchema = z
  .object({
    id: z.string(),
    timestamp: z.number(),
    level: SweetLinkConsoleLevelSchema,
    args: z.array(z.unknown()),
  })
  .passthrough();

const commandResultSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      commandId: z.string(),
      durationMs: z.number(),
      data: z.unknown().optional(),
      console: z.array(consoleEventSchema).optional(),
    })
    .passthrough(),
  z
    .object({
      ok: z.literal(false),
      commandId: z.string(),
      durationMs: z.number(),
      error: z.string(),
      stack: z.string().optional(),
      console: z.array(consoleEventSchema).optional(),
    })
    .passthrough(),
]);

const registerMessageSchema = z
  .object({
    kind: z.literal('register'),
    token: z.string(),
    sessionId: z.string(),
    url: z.string(),
    title: z.string(),
    userAgent: z.string(),
    topOrigin: z.string(),
  })
  .passthrough();

const heartbeatMessageSchema = z
  .object({
    kind: z.literal('heartbeat'),
    sessionId: z.string(),
  })
  .passthrough();

const commandResultMessageSchema = z
  .object({
    kind: z.literal('commandResult'),
    sessionId: z.string(),
    result: commandResultSchema,
  })
  .passthrough();

const consoleMessageSchema = z
  .object({
    kind: z.literal('console'),
    sessionId: z.string(),
    events: z.array(consoleEventSchema),
  })
  .passthrough();

const clientMessageSchema = z.discriminatedUnion('kind', [
  registerMessageSchema,
  heartbeatMessageSchema,
  commandResultMessageSchema,
  consoleMessageSchema,
]);

const runScriptCommandSchema = z
  .object({
    type: z.literal('runScript'),
    code: z.string(),
    timeoutMs: z.number().finite().positive().optional(),
    captureConsole: z.boolean().optional(),
  })
  .passthrough();

const getDomCommandSchema = z
  .object({
    type: z.literal('getDom'),
    selector: z.string().optional(),
    includeShadowDom: z.boolean().optional(),
  })
  .passthrough();

const navigateCommandSchema = z
  .object({
    type: z.literal('navigate'),
    url: z.string(),
  })
  .passthrough();

const pingCommandSchema = z
  .object({
    type: z.literal('ping'),
  })
  .passthrough();

const screenshotCommandSchema = z
  .object({
    type: z.literal('screenshot'),
    mode: z.union([z.literal('full'), z.literal('element')]).default('full'),
    selector: z.union([z.string(), z.null()]).optional(),
    quality: z.number().finite().min(0).max(100).optional(),
    timeoutMs: z.number().finite().positive().optional(),
    renderer: z
      .union([z.literal('auto'), z.literal('puppeteer'), z.literal('html2canvas'), z.literal('html-to-image')])
      .optional(),
    hooks: z.array(z.unknown()).optional(),
  })
  .passthrough();

const discoverSelectorsCommandSchema = z
  .object({
    type: z.literal('discoverSelectors'),
    scopeSelector: z.union([z.string(), z.null()]).optional(),
    limit: z.number().int().positive().optional(),
    includeHidden: z.boolean().optional(),
  })
  .passthrough();

const commandSchema = z.discriminatedUnion('type', [
  runScriptCommandSchema,
  getDomCommandSchema,
  navigateCommandSchema,
  pingCommandSchema,
  screenshotCommandSchema,
  discoverSelectorsCommandSchema,
]);

const timeoutOverrideSchema = z.number().finite().positive().optional();

type ConsoleEvent = SweetLinkConsoleEvent;
type CommandResult = SweetLinkCommandResult;
type CommandWithoutId = z.infer<typeof commandSchema>;
type CommandWithId = CommandWithoutId & { id: string };
type RegisterClientMessage = {
  readonly kind: 'register';
  readonly token: string;
  readonly sessionId: string;
  readonly url: string;
  readonly title: string;
  readonly userAgent: string;
  readonly topOrigin: string;
};
type HeartbeatClientMessage = { readonly kind: 'heartbeat'; readonly sessionId: string };
type CommandResultClientMessage = {
  readonly kind: 'commandResult';
  readonly sessionId: string;
  readonly result: CommandResult;
};
type ConsoleClientMessage = {
  readonly kind: 'console';
  readonly sessionId: string;
  readonly events: readonly ConsoleEvent[];
};
type ClientMessage =
  | RegisterClientMessage
  | HeartbeatClientMessage
  | CommandResultClientMessage
  | ConsoleClientMessage;
type CommandRequest = { command: CommandWithoutId; timeoutMs?: number };


type ServerMessage =
  | { kind: 'command'; sessionId: string; command: CommandWithId }
  | { kind: 'metadata'; sessionId: string; codename: string }
  | { kind: 'disconnect'; reason: string };

interface SessionMetadata {
  readonly sessionId: string;
  readonly userAgent: string;
  readonly url: string;
  readonly title: string;
  readonly topOrigin: string;
  readonly codename: string;
  readonly createdAt: number;
}

const resolveDaemonPort = (value: unknown): number => {
  if (value && typeof value === 'object' && value !== null) {
    const portCandidate = (value as { port?: unknown }).port;
    if (typeof portCandidate === 'number' && Number.isFinite(portCandidate) && portCandidate > 0) {
      return portCandidate;
    }
  }
  return SWEETLINK_DEFAULT_PORT;
};

const isSecretResolution = (value: unknown): value is SweetLinkSecretResolution => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<SweetLinkSecretResolution>;
  if (typeof candidate.secret !== 'string' || candidate.secret.length === 0) {
    return false;
  }
  if (candidate.source !== 'env' && candidate.source !== 'file' && candidate.source !== 'generated') {
    return false;
  }
  if (candidate.path !== undefined && typeof candidate.path !== 'string') {
    return false;
  }
  return true;
};

const assertSecretResolution = (value: unknown): SweetLinkSecretResolution => {
  if (!isSecretResolution(value)) {
    throw new TypeError('SweetLink secret resolution payload is invalid');
  }
  return value;
};

const daemonPort = resolveDaemonPort(readSweetLinkEnv());

async function main() {
  try {
    if (await isDaemonAlreadyRunning(daemonPort)) {
      log(`SweetLink daemon already running on https://localhost:${daemonPort}; exiting.`);
      return;
    }

    const rawSecretResolution = await resolveSweetLinkSecret({ autoCreate: true });
    const { secret, source, path: secretPath } = assertSecretResolution(rawSecretResolution);
    log(`SweetLink secret source: ${source}${secretPath ? ` (${secretPath})` : ''}`);

    ensureCertificates();
    const { cert, key } = loadCertificates();

    const state = new SweetLinkState(secret);

    const server = createHttpsServer({ key, cert }, (req, res) => {
      handleHttpRequest(state, req, res).catch((error) => {
        console.warn('SweetLink daemon request handler failed:', getErrorMessage(error));
      });
    });
    const wsServer = new WebSocketServer({ server, path: SWEETLINK_WS_PATH });
    wsServer.on('connection', (socket) => state.handleSocket(socket));

    server.listen(daemonPort, '127.0.0.1', () => {
      log(`SweetLink daemon listening on https://localhost:${daemonPort}`);
      log(`WebSocket endpoint ready at wss://localhost:${daemonPort}${SWEETLINK_WS_PATH}`);
      log('Press Ctrl+C to stop.');
    });

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    function shutdown(signal: string) {
      log(`Received ${signal}, shutting down SweetLink daemon...`);
      wsServer.close();
      server.close(() => process.exit(0));
      const shutdownTimer: TimerHandle = setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS);
      unrefTimer(shutdownTimer);
    }
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`SweetLink daemon failed to start: ${message}`);
    process.exitCode = 1;
  }
}

async function isDaemonAlreadyRunning(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const request = httpsRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/healthz',
        method: 'GET',
        rejectUnauthorized: false,
        timeout: 750,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      }
    );
    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.end();
  });
}

class SweetLinkState {
  readonly #secret: string;
  readonly #sessions = new Map<string, SessionEntry>();

  constructor(secret: string) {
    this.#secret = secret;
    const expiryInterval: TimerHandle = setInterval(() => this.#expireStaleSessions(), SWEETLINK_HEARTBEAT_INTERVAL_MS);
    unrefTimer(expiryInterval);
  }

  verifyCliToken(token: string) {
    return verifySweetLinkToken({ secret: this.#secret, token, expectedScope: 'cli' });
  }

  handleSocket(socket: WebSocket) {
    let sessionId: string | null = null;

    socket.on('message', (data) => {
      try {
        const raw = decodeSocketPayload(data);
        const parsedMessage = parseClientMessage(JSON.parse(raw));
        const message = parsedMessage as ClientMessage;
        switch (message.kind) {
          case 'register': {
            sessionId = this.#handleRegister(socket, message);
            break;
          }
          case 'heartbeat': {
            this.#touchSession(message.sessionId);
            break;
          }
          case 'commandResult': {
            this.#handleCommandResult(message.sessionId, message.result);
            break;
          }
          case 'console': {
            this.#handleConsoleEvents(message.sessionId, message.events);
            break;
          }
          default: {
            const exhaustiveCheck: never = message;
            // biome-ignore lint/suspicious/noExplicitAny: exhaustiveness guard for impossible state
            const kind = (exhaustiveCheck as any)?.kind ?? String(exhaustiveCheck);
            throw new Error(`Unhandled client message: ${kind}`);
          }
        }
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        console.warn(`SweetLink socket error: ${errorMessage}`);
      }
    });

    socket.once('close', (code: number, reasonBuffer: Buffer) => {
      if (sessionId) {
        const reasonText = reasonBuffer?.toString?.('utf8') ?? '';
        const closeDetail =
          reasonText && reasonText.length > 0 ? `socket closed (${code}: ${reasonText})` : `socket closed (${code})`;
        this.#removeSession(sessionId, closeDetail);
      }
    });
  }

  listSessions(): SweetLinkSessionSummary[] {
    const now = Date.now();
    return [...this.#sessions.values()].map((entry) => {
      const consoleEventsBuffered = entry.consoleBuffer.length;
      let consoleErrorsBuffered = 0;
      for (const event of entry.consoleBuffer) {
        if (event.level === 'error') {
          consoleErrorsBuffered += 1;
        }
      }
      const lastConsoleEventAt = entry.lastConsoleEventAt ?? null;
      return {
        sessionId: entry.metadata.sessionId,
        codename: entry.metadata.codename,
        url: entry.metadata.url,
        title: entry.metadata.title,
        topOrigin: entry.metadata.topOrigin,
        createdAt: entry.metadata.createdAt,
        lastSeenAt: entry.lastHeartbeat,
        heartbeatMsAgo: Math.max(0, now - entry.lastHeartbeat),
        consoleEventsBuffered,
        consoleErrorsBuffered,
        pendingCommandCount: entry.pending.size,
        socketState: this.#socketStateToString(entry.socket.readyState),
        userAgent: entry.metadata.userAgent,
        lastConsoleEventAt,
      } satisfies SweetLinkSessionSummary;
    });
  }

  sendCommand(sessionId: string, rawCommand: CommandWithoutId, timeoutMs = 15_000): Promise<CommandResult> {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found or offline');
    }
    if (session.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Session socket is not open');
    }

    const commandId = createSweetLinkCommandId();
    const command: CommandWithId = { ...rawCommand, id: commandId };
    const payload: ServerMessage = {
      kind: 'command',
      sessionId: session.metadata.sessionId,
      command,
    };

    const serialized = JSON.stringify(payload);

    return new Promise<CommandResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        session.pending.delete(commandId);
        reject(new Error('Command timed out'));
      }, timeoutMs);

      session.pending.set(commandId, {
        commandId,
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout,
      });

      session.socket.send(serialized, (sendError?: Error) => {
        if (sendError) {
          clearTimeout(timeout);
          session.pending.delete(commandId);
          reject(sendError);
        }
      });
    });
  }

  getSessionConsole(sessionId: string): ConsoleEvent[] {
    const session = this.#sessions.get(sessionId);
    return session ? [...session.consoleBuffer] : [];
  }

  #handleRegister(socket: WebSocket, message: RegisterClientMessage): string {
    const token = message.token;
    const sessionId = message.sessionId;
    const payload = verifySweetLinkToken({ secret: this.#secret, token, expectedScope: 'session' });
    if (!payload.sessionId || payload.sessionId !== sessionId) {
      throw new Error('Session token mismatch');
    }

    const metadata: SessionMetadata = {
      sessionId,
      userAgent: message.userAgent,
      url: message.url,
      title: message.title,
      topOrigin: message.topOrigin,
      codename: generateSessionCodename(Array.from(this.#sessions.values(), (session) => session.metadata.codename)),
      createdAt: Date.now(),
    };

    const existing = this.#sessions.get(sessionId);
    if (existing) {
      existing.socket.terminate();
      this.#sessions.delete(sessionId);
    }

    const entry: SessionEntry = {
      metadata,
      socket,
      lastHeartbeat: Date.now(),
      consoleBuffer: [],
      pending: new Map(),
      lastConsoleEventAt: null,
    };

    this.#sessions.set(sessionId, entry);
    try {
      const metadataMessage: ServerMessage = {
        kind: 'metadata',
        sessionId,
        codename: metadata.codename,
      };
      socket.send(JSON.stringify(metadataMessage));
      log(`Sent metadata for session ${sessionId} [${metadata.codename}]`);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.warn(`[SweetLink] Failed to send session metadata for ${sessionId}: ${errorMessage}`);
    }
    log(`Registered SweetLink session ${sessionId} [${metadata.codename}] (${metadata.title || metadata.url})`);
    return sessionId;
  }

  #touchSession(sessionId: string) {
    const session = this.#sessions.get(sessionId);
    if (session) {
      session.lastHeartbeat = Date.now();
    }
  }

  #handleCommandResult(sessionId: string, result: CommandResult) {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      return;
    }
    const pending = session.pending.get(result.commandId);
    if (!pending) {
      return;
    }
    session.pending.delete(result.commandId);
    pending.resolve(result);
  }

  #handleConsoleEvents(sessionId: string, events: readonly ConsoleEvent[]) {
    const session = this.#sessions.get(sessionId);
    if (!(session && events?.length)) {
      return;
    }
    session.consoleBuffer.push(...events);
    if (session.consoleBuffer.length > 200) {
      session.consoleBuffer.splice(0, session.consoleBuffer.length - 200);
    }
    const lastEvent = events.at(-1);
    if (lastEvent) {
      session.lastConsoleEventAt = lastEvent.timestamp ?? Date.now();
    }
  }

  #socketStateToString(readyState: number): 'open' | 'closing' | 'closed' | 'connecting' | 'unknown' {
    return SOCKET_STATE_LABEL[readyState] ?? 'unknown';
  }

  #removeSession(sessionId: string, reason: string) {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      return;
    }
    this.#sessions.delete(sessionId);
    for (const pending of session.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Session ended before command completed: ${reason}`));
    }
    log(`Session ${sessionId} [${session.metadata.codename}] disconnected (${reason})`);
  }

  #expireStaleSessions() {
    const now = Date.now();
    for (const session of this.#sessions.values()) {
      if (now - session.lastHeartbeat > SWEETLINK_HEARTBEAT_TOLERANCE_MS) {
        session.socket.terminate();
        this.#sessions.delete(session.metadata.sessionId);
        log(`Session ${session.metadata.sessionId} [${session.metadata.codename}] expired due to missed heartbeats`);
      }
    }
  }
}

async function handleHttpRequest(state: SweetLinkState, req: IncomingMessage, res: ServerResponse) {
  const basePort = daemonPort;
  const requestUrl = req.url ? new URL(req.url, `https://localhost:${basePort}`) : null;
  if (!requestUrl) {
    respondJson(res, 400, { error: 'Invalid request URL' });
    return;
  }

  if (req.method === 'OPTIONS') {
    respondCors(res);
    return;
  }

  if (requestUrl.pathname === '/healthz') {
    respondJson(res, 200, { status: 'ok' });
    return;
  }

  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    respondJson(res, 401, { error: 'Missing SweetLink token' });
    return;
  }

  try {
    const token = authorization.slice('Bearer '.length).trim();
    state.verifyCliToken(token);
  } catch (error) {
    const message = getErrorMessage(error);
    respondJson(res, 401, { error: message });
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/sessions') {
    const sessions = state.listSessions();
    respondJson(res, 200, { sessions });
    return;
  }

  if (
    req.method === 'GET' &&
    requestUrl.pathname.startsWith('/sessions/') &&
    requestUrl.pathname.endsWith('/console')
  ) {
    const sessionId = requestUrl.pathname.split('/')[2];
    if (sessionId == null) {
      respondJson(res, 400, { error: 'Session id missing' });
      return;
    }
    const events = state.getSessionConsole(sessionId);
    respondJson(res, 200, { sessionId, events });
    return;
  }

  if (
    req.method === 'POST' &&
    requestUrl.pathname.startsWith('/sessions/') &&
    requestUrl.pathname.endsWith('/command')
  ) {
    const sessionId = requestUrl.pathname.split('/')[2];
    if (sessionId == null) {
      respondJson(res, 400, { error: 'Session id missing' });
      return;
    }
    try {
      const rawBody = await readJson(req);
      const { command, timeoutMs } = parseCommandRequest(rawBody);
      const result = await state.sendCommand(sessionId, command, timeoutMs ?? 15_000);
      respondJson(res, 200, { result });
    } catch (error) {
      const message = getErrorMessage(error);
      respondJson(res, 400, { error: message });
    }
    return;
  }

  respondJson(res, 404, { error: 'Not Found' });
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const bufferChunk: Buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : (chunk as Buffer);
    chunks.push(bufferChunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

function respondJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body ?? {}, null, 2);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.end(payload);
}

function respondCors(res: ServerResponse) {
  res.statusCode = 204;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.end();
}

function decodeSocketPayload(data: WebSocket.RawData): string {
  if (typeof data === 'string') {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }
  if (Array.isArray(data)) {
    const buffers = data.map((chunk) => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    return Buffer.concat(buffers).toString('utf8');
  }
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('utf8');
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  return Buffer.from([]).toString('utf8');
}

function parseClientMessage(raw: unknown): unknown {
  return clientMessageSchema.parse(raw);
}

function parseCommandRequest(raw: unknown): CommandRequest {
  const candidate = ensureObject(raw);
  const command = commandSchema.parse(candidate);
  const timeoutMs = timeoutOverrideSchema.parse(candidate.timeoutMs);
  return { command, timeoutMs };
}

function ensureObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Request body must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function ensureCertificates() {
  if (existsSync(CERT_PATH) && existsSync(KEY_PATH)) {
    return;
  }

  log('Generating SweetLink TLS certificates via mkcert...');
  mkdirSync(CERT_DIR, { recursive: true });

  const mkcertLookup = spawnSync('which', ['mkcert'], { stdio: 'pipe' });
  if (mkcertLookup.status !== 0) {
    const secretPath = getDefaultSweetLinkSecretPath();
    throw new Error(
      'mkcert is required but not found. Install via "brew install mkcert nss" and rerun pnpm sweetlink. ' +
        `Generated SweetLink secret saved at ${secretPath}.`
    );
  }

  const install = spawnSync('mkcert', ['-install'], { stdio: 'inherit' });
  if (install.status !== 0) {
    throw new Error('Failed to run mkcert -install');
  }

  const create = spawnSync(
    'mkcert',
    ['-cert-file', CERT_PATH, '-key-file', KEY_PATH, 'localhost', '127.0.0.1', '::1'],
    { stdio: 'inherit' }
  );
  if (create.status !== 0) {
    throw new Error('Failed to generate mkcert certificates');
  }
}

function loadCertificates() {
  const cert = readFileSync(CERT_PATH);
  const key = readFileSync(KEY_PATH);
  return { cert, key };
}

function log(message: string) {
  console.log(`[SweetLink] ${message}`);
}

try {
  await main();
} catch (error) {
  const message = getErrorMessage(error);
  console.error(`[SweetLink] Daemon failed: ${message}`);
  process.exit(1);
}
