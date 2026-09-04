import { describe, expect, it } from '@jest/globals';
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
