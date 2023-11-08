import * as debugModule from 'debug';
import { CliCommandError } from '../../errors';
import * as path from 'path';
import * as subprocess from './subprocess';
import * as fs from 'fs';
import * as os from 'os';

const debug = debugModule('snyk');

async function handle(
  operation: string,
  command: string,
  args: string[],
): Promise<subprocess.ExecResult> {
  debug(`running dotnet command: ${operation}: ${command}`);

  try {
    return await subprocess.execute(command, args);
  } catch (error: unknown) {
    if (
      !(
        typeof error === 'object' &&
        error !== null &&
        'stdout' in error &&
        'stderr' in error
      )
    ) {
      throw new CliCommandError(
        `dotnet ${operation} failed with error: ${error}`,
      );
    }

    const message = error.stdout || error.stderr;
    throw new CliCommandError(
      `dotnet ${operation} failed with error: ${message}`,
    );
  }
}

export async function validate() {
  const command = 'dotnet';
  const args = ['--version'];

  try {
    await handle('version', command, args);
  } catch (error: unknown) {
    debug('dotnet tool not found, did you install dotnet core?');
    throw error;
  }
}

export async function restore(projectPath: string): Promise<void> {
  const command = 'dotnet';
  const args = ['restore', '--no-cache', projectPath];
  await handle('restore', command, args);
  return;
}

export async function run(
  projectPath: string,
  options: string[],
): Promise<string> {
  const command = 'dotnet';
  const args = ['run', '--project', projectPath].concat(options);
  const response = await handle('run', command, args);
  return response.stdout;
}

export async function publish(
  projectPath: string,
  targetFramework?: string,
): Promise<string> {
  const command = 'dotnet';
  const args = ['publish', '--nologo'];
  // Self-contained: Create all required .dlls for version investigation, don't rely on the environment.
  args.push('--sc');

  // If your .csproj file contains multiple <TargetFramework> references, you need to supply which one you want to publish.
  if (targetFramework) {
    args.push('--framework');
    args.push(targetFramework);
  }

  // Define a temporary output dir to use for detecting .dlls to use for runtime version assembly detection.
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `snyk-nuget-plugin-publish-csharp-`),
  );
  args.push('--output');
  args.push(tempDir);

  // The path that contains either some form of project file, or a .sln one.
  // See: https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-publish#arguments
  args.push(projectPath);

  await handle('publish', command, args);

  return tempDir;
}
