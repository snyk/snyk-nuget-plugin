import * as fs from 'fs';
import * as path from 'path';
import * as dotnet from './dotnet';
import * as nugetFrameworksParser from '../csharp/nugetframeworks_parser';
import { extractSdkInfo } from '../runtime-assembly-v2';
import { TargetFrameworkInfo } from '../types';

// Process-lifetime memoisation for the dotnet calls the runtime resolution flow makes per
// project. None of their answers depend on the project being scanned: the helper app and the
// TargetFramework it parses only depend on the SDK, and `--info`/`--list-runtimes` only on the
// global.json that pins the SDK for the working directory. Without this an
// `--all-projects` scan rebuilt and re-ran the helper for every project, see OSM-3983.
//
// Promises are stored rather than values so concurrent callers share one spawn, and a
// rejection is dropped from the cache so a later call can retry.

const helperBuilds = new Map<string, Promise<string>>();
const targetFrameworkInfos = new Map<string, Promise<TargetFrameworkInfo>>();
const sdkInfos = new Map<string, ReturnType<typeof extractSdkInfo>>();
const runtimeLists = new Map<string, Promise<string>>();

function memoise<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  compute: () => Promise<T>,
): Promise<T> {
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const pending = compute().catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
}

// Writes the NuGet.Frameworks helper app for this SDK and builds it once, returning its location.
export function buildFrameworksParser(sdkVersion: string): Promise<string> {
  const location = nugetFrameworksParser.generate(sdkVersion);
  return memoise(helperBuilds, path.resolve(location), async () => {
    await dotnet.build(location);
    return location;
  });
}

export function parseTargetFramework(
  parserLocation: string,
  targetFramework: string,
): Promise<TargetFrameworkInfo> {
  const key = `${path.resolve(parserLocation)}\0${targetFramework}`;
  return memoise(targetFrameworkInfos, key, async () => {
    const response = await dotnet.run(parserLocation, [targetFramework]);
    return JSON.parse(response) as TargetFrameworkInfo;
  });
}

// Which SDK answers in a folder is decided by the nearest global.json above it, or by the
// dotnet on the PATH when there is none, so folders sharing that file share the answer.
function sdkSelectionKey(projectFolder: string): string {
  let dir = path.resolve(projectFolder);
  for (;;) {
    const globalJson = path.join(dir, 'global.json');
    if (fs.existsSync(globalJson)) {
      return globalJson;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return '';
    }
    dir = parent;
  }
}

export function sdkInfo(
  projectFolder: string,
): ReturnType<typeof extractSdkInfo> {
  return memoise(sdkInfos, sdkSelectionKey(projectFolder), () =>
    extractSdkInfo(projectFolder),
  );
}

export function listRuntimes(projectFolder: string): Promise<string> {
  return memoise(runtimeLists, sdkSelectionKey(projectFolder), () =>
    dotnet.execute(['--list-runtimes'], projectFolder),
  );
}

export function reset(): void {
  helperBuilds.clear();
  targetFrameworkInfos.clear();
  sdkInfos.clear();
  runtimeLists.clear();
  dotnet.resetVersionCache();
}
