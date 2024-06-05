import * as debugModule from 'debug';
import * as errors from '../../errors';
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

export async function validate(): Promise<string> {
  const command = 'dotnet';
  const args = ['--version'];

  try {
    const result = await handle('version', command, args);
    return result.stdout.trim();
  } catch (error: unknown) {
    debug('dotnet tool not found, did you install dotnet core?');
    throw error;
  }
}

export async function restore(projectPath: string): Promise<string> {
  const command = 'dotnet';
  const args = [
    'restore',
    // Get a larger amount of debugging information to stdout in case something fails.
    // Useful for customers to attempt self-debugging before raising support requests.
    '--verbosity',
    'normal',
    projectPath,
  ];
  const result = await handle('restore', command, args);

  // A customer can define a <BaseOutPutPath> that redirects where `dotnet` saves the assets file. This will
  // get picked up by the dotnet tool and reported in the output logs.
  const regex = /Path:\s+(\S+project.assets.json)/g;
  const matches = result.stdout.matchAll(regex);

  const manifestFiles: string[] = [];
  for (const match of matches) {
    manifestFiles.push(match[1]);
  }

  if (manifestFiles.length === 0) {
    throw new errors.FileNotProcessableError(
      'found no information in stdout about the whereabouts of the assets file',
    );
  }

  // Return the last element in the log, as it might be mentioning local asset files in reverse order.
  return manifestFiles[manifestFiles.length - 1];
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

  // Use the current runtime of whatever platform we are on.
  // This ensures that .dlls will be packaged containing the runtime assembly versions.
  // TODO: (OSM-521) if/when we allow this to be dynamic based on user input, remember to change this.
  args.push('--use-current-runtime');

  // If your .csproj file contains multiple <TargetFramework> references, you need to supply which one you want to publish.
  if (targetFramework) {
    args.push('--framework');
    args.push(targetFramework);
  }

  // See https://devblogs.microsoft.com/nuget/enable-repeatable-package-restores-using-a-lock-file/
  // Forces the usage of the lockfile for PackageReference packages to ensure that the locked versions are published
  args.push('-p:RestoreLockedMode=true');

  // Define a temporary output dir to use for detecting .dlls to use for runtime version assembly detection.
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `snyk-nuget-plugin-publish-csharp-`),
  );

  // See https://learn.microsoft.com/en-us/dotnet/core/compatibility/sdk/7.0/solution-level-output-no-longer-valid#recommended-action
  // about why we're not using `--output` for this.
  args.push(`--property:PublishDir=${tempDir}`);

  // The path that contains either some form of project file, or a .sln one.
  // See: https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-publish#arguments
  args.push(projectPath);

  await handle('publish', command, args);

  return tempDir;
}
