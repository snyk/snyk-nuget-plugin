import util = require('node:util');
import * as debugModule from 'debug';
import * as path from 'path';
import * as childProcess from 'child_process';
import { CliCommandError } from '../../errors';

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
    if (!(typeof error === 'object' && error !== null && 'stdout' in error)) {
      throw new CliCommandError(
        `dotnet ${operation} failed with error: ${error}`,
      );
    }

    throw new CliCommandError(
      `dotnet ${operation} failed with error: ${error.stdout}`,
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

export async function publish(filePath: string): Promise<string> {
  const dirname = path.dirname(filePath);
  const filename = path.basename(filePath);

  let command = `cd ${dirname} `;
  command += '&& dotnet publish --nologo ';
  // Self-contained: Create all required .dlls for version investigation, don't rely on the environment.
  command += '--sc ';

  // There could be multiple .csproj files in the same directory.
  command += filename;

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
    .split('\n')
    // TODO: For multiple target frameworks, replace `find` with a map or something of that kind to return more than the first.
    .find((line) => line.includes(path.join(path.sep, 'publish', path.sep)));

  if (!publishDirLine) {
    const err = `Could not find a valid publish path while reading stdout: ${response.stdout}`;
    debug(err);
    throw new CliCommandError(`Unable to find a publish dir: ${err}`);
  }

  const [, publishDir] = publishDirLine.split('->') ?? [];
  if (!publishDir) {
    const err = `Could not find a valid publish dir while splitting the line: ${publishDirLine}`;
    debug(err);
    throw new CliCommandError(`Unable to find a publish dir: ${err}`);
  }

  return publishDir.trim();
}
