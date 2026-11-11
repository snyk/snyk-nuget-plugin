import { describe, expect, it } from '@jest/globals';
import childProcess from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as subprocess from '../../lib/nuget-parser/cli/subprocess';

describe('when a subprocess cannot be started', () => {
  it.each([
    {
      description: 'the command is not on the PATH',
      command: 'snyk-nuget-plugin-not-a-real-command',
      options: undefined,
    },
    {
      description: 'the working directory does not exist',
      command: process.execPath,
      options: {
        cwd: path.join(os.tmpdir(), 'snyk-nuget-plugin-not-a-real-directory'),
      },
    },
  ])('rejects when $description', async ({ command, options }) => {
    await expect(
      subprocess.execute(command, ['--version'], options),
    ).rejects.toThrow(/^spawn /);
  });

  it('resolves when the process runs', async () => {
    const result = await subprocess.execute(process.execPath, ['--version']);
    expect(result.stdout).toContain(process.version);
  });
});

describe('child process environment', () => {
  const PRINT_ENV = path.join(__dirname, '..', 'fixtures', 'print-env.js');

  const TEST_ENV: Record<string, string> = {
    SNYK_TOKEN: 'test-token',
    SNYK_OAUTH_TOKEN: 'test-oauth-token',
    // eslint-disable-next-line camelcase
    snyk_cfg_api: 'test-cfg-api',
    HTTP_PROXY: 'http://internal:1',
    SNYK_SYSTEM_HTTP_PROXY: 'http://corp:3128',
    UNRELATED_VAR: 'keep',
  };
  const isSnykKey = (key: string) => /^snyk_/i.test(key);
  const hasPath = (keys: string[]) =>
    keys.some((key) => key.toUpperCase() === 'PATH');

  let savedEnv: Map<string, string | undefined>;

  beforeEach(() => {
    savedEnv = new Map();
    for (const key of Object.keys(TEST_ENV)) {
      savedEnv.set(key, process.env[key]);
    }
    Object.assign(process.env, TEST_ENV);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const [key, value] of savedEnv) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('passes spawn an env without SNYK_* variables and with the user proxy', async () => {
    const spy = jest.spyOn(childProcess, 'spawn');
    await subprocess.execute(process.execPath, [PRINT_ENV]);
    const env = spy.mock.calls[0][2]?.env;
    expect(env).toBeDefined();
    expect(Object.keys(env!).filter(isSnykKey)).toEqual([]);
    expect(env!.HTTP_PROXY).toBe('http://corp:3128');
    expect(env!.http_proxy).toBe('http://corp:3128');
    expect(env!.UNRELATED_VAR).toBe('keep');
    expect(hasPath(Object.keys(env!))).toBe(true);
  });

  it('the child process sees no SNYK_* variables and gets the user proxy', async () => {
    const { stdout } = await subprocess.execute(process.execPath, [PRINT_ENV]);
    const child = JSON.parse(stdout);
    expect(child.keys.filter(isSnykKey)).toEqual([]);
    expect(child.HTTP_PROXY).toBe('http://corp:3128');
    expect(child.http_proxy).toBe('http://corp:3128');
    expect(child.UNRELATED_VAR).toBe('keep');
    expect(hasPath(child.keys)).toBe(true);
  });

  it('does not modify process.env', async () => {
    await subprocess.execute(process.execPath, [PRINT_ENV]);
    expect(process.env.SNYK_TOKEN).toBe('test-token');
    expect(process.env.HTTP_PROXY).toBe('http://internal:1');
  });

  it('cleans an env passed by the caller', async () => {
    const { stdout } = await subprocess.execute(process.execPath, [PRINT_ENV], {
      env: { ...process.env, SNYK_EXTRA: 'x' } as Record<string, string>,
    });
    const child = JSON.parse(stdout);
    expect(child.keys.filter(isSnykKey)).toEqual([]);
    expect(child.http_proxy).toBe('http://corp:3128');
  });
});
