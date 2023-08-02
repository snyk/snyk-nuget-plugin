import * as util from 'util';
import * as debugModule from 'debug';
import * as childProcess from 'child_process';
import { CliCommandError } from '../../errors';
import * as path from 'path';

const debug = debugModule('snyk');

const exec = util.promisify(childProcess.exec);

interface ExecResult {
  stdout: string;
  stderr: string;
}

async function handle(operation: string, command: string): Promise<ExecResult> {
  debug(`running dotnet command: ${operation}: ${command}`);

  try {
    return await exec(command);
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
  const command = 'dotnet --version';

  try {
    await handle('version', command);
  } catch (error: unknown) {
    debug('dotnet tool not found, did you install dotnet core?');
    throw error;
  }
}

export async function restore(projectPath: string): Promise<void> {
  const command = `dotnet restore ${projectPath}`;
  await handle('restore', command);
  return;
}

export async function publish(projectPath: string): Promise<string> {
  let command = 'dotnet publish --nologo ';
  // Self-contained: Create all required .dlls for version investigation, don't rely on the environment.
  command += '--sc ';
  // The path that contains either some form of project file, or a .sln one.
  // See: https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-publish#arguments
  command += projectPath;

  const response = await handle('publish', command);

  // The default output folder is [project_file_folder]/bin/[configuration]/[framework]/[runtime]/publish/
  // for a self-contained executable. Specifically determining an output folder with --output is deprecated,
  // as it leads to unpredictable results for multiple target frameworks and runtimes, so we have to cherry-pick
  // the folders.
  // See: https://learn.microsoft.com/en-us/dotnet/core/compatibility/sdk/7.0/solution-level-output-no-longer-valid.
  // FIXME: As we're not supporting multiple frameworks all over the place, we have to just take the first one.
  //  It's probably safe, as runtime dll versions most likely don't differ much across *most* dependencies, but
  //  OS-specific ones (e.g. crypto) might.

  // Looking for something like <project_name> -> /path/to/<project_name>/bin/Debug/<target_framework>/publish/ on Unix.
  // We could also just hope Microsoft never changes their naming convention, but I think this is less error-prone,
  // and will potentially also support multiple target frameworks.
  const publishDirLine = response.stdout
    .split(/[\r\n]+/)
    // TODO: For multiple target frameworks, replace `find` with a map or something of that kind to return more than the first.
    // The first thing to get published ought to be the project's own .dll or .exe file, depending on the architecture.
    // E.g., something like:
    // dotnet_6 -> /foo/bar/project/bin/Debug/net6.0/osx-arm64/project_name.dll
    // Either way, since we're forcing a publish of a self-contained project, all .dlls should be placed there.
    // This logic does seem a bit popsicle and duct-tape ish, but I have yet to find a more stable solution. PRs welcome!
    .find((line) => line.endsWith('.dll') || line.endsWith('.exe'));

  if (!publishDirLine) {
    const err = `Could not find a valid publish path while reading stdout: ${response.stdout}`;
    debug(err);
    throw new CliCommandError(`Unable to find a publish dir: ${err}`);
  }

  // dotnet_6 -> /foo/bar/project/bin/Debug/net6.0/osx-arm64/project_name.dll will then have the first part removed:
  const [, publishedDllPath] = publishDirLine.split('->') ?? [];
  if (!publishedDllPath) {
    const err = `Could not find a valid publish dir while splitting the line: ${publishDirLine}`;
    debug(err);
    throw new CliCommandError(`Unable to find a publish dir: ${err}`);
  }

  // /foo/bar/project/bin/Debug/net6.0/osx-arm64/project_name.dll will then need to be stripped from a file name,
  // in order to return just the so-called "publish dir":
  const dirName = path.dirname(publishedDllPath.trim());
  return dirName;
}
