import { afterEach, describe, expect, it } from '@jest/globals';
import * as os from 'os';
import * as path from 'path';
import * as subprocess from '../../lib/nuget-parser/cli/subprocess';

const PRINT_ENV = path.join(__dirname, '..', 'fixtures', 'print-env.js');
const LOWERCASE_SNYK_VAR = 'snyk_lowercase_token';

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
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it("the child gets no SNYK_* variables and the user's HTTP_PROXY", async () => {
    process.env = {
      ...originalEnv,
      SNYK_TOKEN: 'test-token',
      [LOWERCASE_SNYK_VAR]: 'test-token',
      HTTP_PROXY: 'http://internal:1',
      SNYK_SYSTEM_HTTP_PROXY: 'http://corp:3128',
    };

    const child = JSON.parse(
      (await subprocess.execute('node', [PRINT_ENV])).stdout,
    );

    expect(child.keys.filter((key: string) => /^snyk_/i.test(key))).toEqual([]);
    expect(child.HTTP_PROXY).toBe('http://corp:3128');
  });
});
