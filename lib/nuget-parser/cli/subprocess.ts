import { spawn, SpawnOptions } from 'child_process';
import { cleanSnykEnv } from '@snyk/cli-interface';

interface ProcessOptions {
  cwd?: string;
  env?: { [name: string]: string };
}

export interface ExecResult {
  stdout: string;
  stderr: string;
}

function makeSpawnOptions(options?: ProcessOptions) {
  const spawnOptions: SpawnOptions = {
    shell: false,
    env: { ...process.env },
  };
  if (options?.cwd) {
    spawnOptions.cwd = options.cwd;
  }

  if (options?.env) {
    spawnOptions.env = { ...spawnOptions.env, ...options.env };
  } else {
    spawnOptions.env = { ...spawnOptions.env };
  }

  spawnOptions.env = cleanSnykEnv(spawnOptions.env, process.env);

  return spawnOptions;
}

export function execute(
  command: string,
  args: string[],
  options?: ProcessOptions,
): Promise<ExecResult> {
  const spawnOptions = makeSpawnOptions(options);
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const proc = spawn(command, args, spawnOptions);

    // Emitted when the process cannot be started at all: binary not on the PATH,
    // missing working directory, or not executable. No process means no 'close' event,
    // so without this the promise never settles and node throws the unhandled 'error'.
    proc.on('error', reject);

    proc.stdout?.on('data', (data) => {
      stdout = stdout + data;
    });
    proc.stderr?.on('data', (data) => {
      stderr = stderr + data;
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject({ stdout, stderr });
      }
      resolve({ stdout, stderr });
    });
  });
}
