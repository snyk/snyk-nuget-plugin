import { spawn, SpawnOptions } from 'child_process';

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

  // Before spawning an external process, we check if we need to
  // restore the system proxy configuration, which overrides the CLI internal proxy configuration.
  if (process.env.SNYK_SYSTEM_HTTP_PROXY !== undefined) {
    spawnOptions.env.HTTP_PROXY = process.env.SNYK_SYSTEM_HTTP_PROXY;
  }
  if (process.env.SNYK_SYSTEM_HTTPS_PROXY !== undefined) {
    spawnOptions.env.HTTPS_PROXY = process.env.SNYK_SYSTEM_HTTPS_PROXY;
  }
  if (process.env.SNYK_SYSTEM_NO_PROXY !== undefined) {
    spawnOptions.env.NO_PROXY = process.env.SNYK_SYSTEM_NO_PROXY;
  }

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
