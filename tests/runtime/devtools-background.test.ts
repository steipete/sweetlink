import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readLocalEnvStringMock = vi.fn();
const cloneProcessEnvMock = vi.fn();

vi.mock('../../src/core/env', () => ({
  readLocalEnvString: readLocalEnvStringMock,
  cloneProcessEnv: cloneProcessEnvMock,
}));

const mkdirMock = vi.fn();
const readFileMock = vi.fn();
const writeFileMock = vi.fn();
const rmMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
  rm: rmMock,
}));

const spawnMock = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('../../src/env', () => ({
  sweetLinkDebug: true,
}));

const noop = () => {
  /* suppress console noise */
};

vi.mock('../../src/util/errors', () => ({
  isErrnoException: (value: unknown): value is NodeJS.ErrnoException =>
    typeof value === 'object' &&
    value !== null &&
    'code' in (value as { code?: string }) &&
    typeof (value as { code?: string }).code === 'string',
}));

const { DEVTOOLS_LISTENER_PID_PATH } = await import('../../src/runtime/devtools/constants');
const { ensureBackgroundDevtoolsListener } = await import('../../src/runtime/devtools/background');

const createErrno = (code: string): NodeJS.ErrnoException => {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
};

const createChildProcess = (pid: number) => {
  const child = {
    pid,
    once: vi.fn().mockReturnThis(),
    unref: vi.fn(),
  };
  return child;
};

beforeEach(() => {
  readLocalEnvStringMock.mockReset();
  cloneProcessEnvMock.mockReset();
  cloneProcessEnvMock.mockReturnValue({});
  mkdirMock.mockReset();
  readFileMock.mockReset();
  writeFileMock.mockReset();
  rmMock.mockReset();
  spawnMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ensureBackgroundDevtoolsListener', () => {
  it('skips spawning when SWEETLINK_DISABLE_AUTO_DEVTOOLS is set', async () => {
    readLocalEnvStringMock.mockReturnValue('1');

    await ensureBackgroundDevtoolsListener({});

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('launches the listener, writes the pid file, and logs when not quiet', async () => {
    readLocalEnvStringMock.mockReturnValue('0');
    readFileMock.mockRejectedValue(createErrno('ENOENT'));

    const child = createChildProcess(4321);
    spawnMock.mockReturnValue(child);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(noop);

    await ensureBackgroundDevtoolsListener({ sessionId: 'session-123' });

    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(['devtools', 'listen', '--background', '--session', 'session-123']),
      expect.objectContaining({ detached: true, stdio: 'ignore' })
    );
    expect(mkdirMock).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith(DEVTOOLS_LISTENER_PID_PATH, '4321\n', 'utf8');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Started background DevTools listener'));

    logSpy.mockRestore();
  });

  it('clears stale pid files and respawns quietly when the previous process exited', async () => {
    readLocalEnvStringMock.mockReturnValue('0');
    readFileMock.mockResolvedValue('55');
    rmMock.mockResolvedValue(undefined);

    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw createErrno('ESRCH');
    });

    const child = createChildProcess(777);
    spawnMock.mockReturnValue(child);

    await ensureBackgroundDevtoolsListener({ quiet: true });

    expect(rmMock).toHaveBeenCalledWith(DEVTOOLS_LISTENER_PID_PATH, { force: true });
    expect(writeFileMock).toHaveBeenCalledWith(DEVTOOLS_LISTENER_PID_PATH, '777\n', 'utf8');
  });

  it('logs a warning when the listener child emits an error', async () => {
    readLocalEnvStringMock.mockReturnValue('0');
    readFileMock.mockRejectedValue(createErrno('ENOENT'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);

    const child = {
      pid: 0,
      once: vi.fn((event: string, handler: (error: Error) => void) => {
        if (event === 'error') {
          handler(new Error('spawn failed'));
        }
        return child;
      }),
      unref: vi.fn(),
    };
    spawnMock.mockReturnValue(child);

    await ensureBackgroundDevtoolsListener({});

    expect(warnSpy).toHaveBeenCalledWith('Background DevTools listener process failed:', expect.any(Error));
    warnSpy.mockRestore();
  });

  it('warns when the pid file cannot be read', async () => {
    readLocalEnvStringMock.mockReturnValue('0');
    readFileMock.mockRejectedValue(new Error('permission denied'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);

    spawnMock.mockReturnValue(createChildProcess(1234));

    await ensureBackgroundDevtoolsListener({});

    expect(warnSpy).toHaveBeenCalledWith('Failed to read DevTools listener pid file:', expect.any(Error));
    warnSpy.mockRestore();
  });

  it('warns when clearing the pid file fails with non-ENOENT errors', async () => {
    readLocalEnvStringMock.mockReturnValue('0');
    readFileMock.mockResolvedValue('101');
    rmMock.mockRejectedValue(createErrno('EACCES'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);

    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw createErrno('ESRCH');
    });

    spawnMock.mockReturnValue(createChildProcess(888));

    await ensureBackgroundDevtoolsListener({});

    expect(warnSpy).toHaveBeenCalledWith('Failed to clear DevTools listener pid file:', expect.any(Error));
    warnSpy.mockRestore();
  });
});
