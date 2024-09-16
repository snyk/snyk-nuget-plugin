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

export async function restore(projectPath: string): Promise<void> {
  const command = 'dotnet';
  const args = [
    'restore',
    // Get a larger amount of debugging information to stdout in case something fails.
    // Useful for customers to attempt self-debugging before raising support requests.
    '--verbosity',
    'normal',
    `"${projectPath}"`,
  ];
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

  // Use the current runtime of whatever platform we are on.
  // This ensures that .dlls will be packaged containing the runtime assembly versions.
  // TODO: (OSM-521) if/when we allow this to be dynamic based on user input, remember to change this.
  args.push('--use-current-runtime');

  // If your .csproj file contains multiple <TargetFramework> references, you need to supply which one you want to publish.
  if (targetFramework) {
    args.push('--framework');
    args.push(targetFramework);
  }

  // Define a temporary output dir to use for detecting .dlls to use for runtime version assembly detection.
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `snyk-nuget-plugin-publish-csharp-`),
  );

  // Changing the PublishDir a temporary directory.
  // See https://learn.microsoft.com/en-us/dotnet/core/compatibility/sdk/7.0/solution-level-output-no-longer-valid#recommended-action
  // about why we're not using `--output` for this.

  // Some projects can have <IsPublishable> turned to false, that won't allow `publish` command to generate the binary we
  // need for resolution, so we're going to force <IsPublishable> to be true.
  // See https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-publish#msbuild

  // Some projects can have <PublishSingleFile> turned on, that won't generate the self-container binary we need,
  // so we're disabling it during our scan.
  // See https://learn.microsoft.com/en-us/dotnet/core/deploying/single-file/overview?tabs=cli
  args.push(
    `--p:PublishDir=${tempDir};IsPublishable=true;PublishSingleFile=false`,
  );

  // The path that contains either some form of project file, or a .sln one.
  // See: https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-publish#arguments
  args.push(`"${projectPath}"`);

  await handle('publish', command, args);

  return tempDir;
}
