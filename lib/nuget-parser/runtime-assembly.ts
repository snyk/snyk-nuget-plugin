import {
  AssemblyVersions,
  RuntimeAssemblyVersions,
  TargetFramework,
} from './types';
import * as errors from '../errors/';
import * as fs from 'fs';
import { isEmpty } from 'lodash';
import * as path from 'path';
import * as debugModule from 'debug';

const debug = debugModule('snyk');

type Targets = Record<string, object>;

// For the difference between the two, see:
// https://learn.microsoft.com/en-us/troubleshoot/developer/visualstudio/general/assembly-version-assembly-file-version
interface Versions {
  assemblyVersion: string;
  fileVersion: string;
}

// At least to keep project development iterative, don't support needle and haystack'ing dependency JSON
// for target frameworks other than .NET 5+ and .NET Core, as other frameworks generates vastly other types of
// .json graphs, requiring a whole other parsing strategy to extract tne runtime dependencies.
// For a list of version naming currently available, see
// https://learn.microsoft.com/en-us/dotnet/standard/frameworks#supported-target-frameworks
export function isSupported(targetFramework: TargetFramework): boolean {
  if (!('original' in targetFramework)) {
    return false;
  }

  // Everything that does not start with 'net' is already game over. E.g. Windows Phone (wp) or silverlight (sl) etc.
  if (!targetFramework.original.startsWith('net')) {
    return false;
  }

  // What's left is:
  // - .NET Core: netcoreappN.N,
  // - .NET 5+ netN.N,
  // - .NET Standard: netstandardN.N and
  // - .NET Framework: netNNN, all of which we support except the latter.
  // So if there's a dot, we're good.
  if (targetFramework.original.includes('.')) {
    return true;
  }

  // Otherwise it's something before .NET 5 and we're out
  return false;
}

// The Nuget dependency resolution rule of lowest applicable version
// (see https://learn.microsoft.com/en-us/nuget/concepts/dependency-resolution#lowest-applicable-version)
// does not apply to runtime dependencies. If you resolve a dependency graph of some package, that depends on
// System.Http.Net 4.0.0, you might still very well end up using System.Http.Net 7.0.0 if you are running your
// executable on .net7.0.
// The `dotnet publish` will give a good estimate of what runtime dependencies are going to be used, so we inspect
// that for information.
// See https://natemcmaster.com/blog/2017/12/21/netcore-primitives/ for a good overview.
export function generateRuntimeAssemblies(filePath: string): AssemblyVersions {
  debug('extracting runtime assemblies from ' + filePath);

  const depsFile = fs.readFileSync(filePath);
  const deps = JSON.parse(depsFile.toString('utf-8'));

  if (!deps.targets) {
    throw new errors.FileNotProcessableError(
      'could not find any targets in deps file',
    );
  }

  // Run through all TargetFrameworks, indexed for example
  // .NETCoreApp,Version=v6.0/osx-arm64,
  // .NETCoreApp,Version=v6.0/alpine-armv6
  // ... etc.
  // See all: https://github.com/dotnet/runtime/blob/bd83e17052d3c09022bad1d91dca860ca6b27ab9/src/libraries/Microsoft.NETCore.Platforms/src/runtime.json
  const runtimeAssemblyVersions: RuntimeAssemblyVersions = {};
  Object.entries(deps.targets as Targets).forEach(([target, dependencies]) => {
    // Ignore target frameworks without dependencies, as they hold no dlls and thus no assembly versions to gauge.
    if (isEmpty(dependencies)) {
      return;
    }

    // The RuntimeIdentifier's (RID) dependencies are located as `runtime` objects under dependencies.
    // Depending on the TargetFramework, they can be located different places, so we need to iterate the whole
    // list of targets for their `runtime` objects
    // E.g., find the first entry in the list of targets as:
    //  "your-top-level-project/1.0.0": {...},
    //  "Castle.Core/4.4.1": {...},
    //  "runtimepack.Microsoft.NETCore.App.Runtime.osx-arm64/6.0.16": { runtime: {...} },
    // ... etc.
    const runtimes = {};
    let name: string;
    let runtime: Record<string, Versions>;
    for (const packageInfo of Object.values(dependencies)) {
      if (!('runtime' in packageInfo)) {
        continue;
      }

      // This can be either one or more runtime deps nested under a single leaf.
      runtime = packageInfo.runtime;

      if (runtime && Object.keys(runtime).length > 0) {
        for (const [fullName, version] of Object.entries(runtime)) {
          if (isEmpty(version)) {
            continue;
          }

          // For some versions of .NET, the dependency version generated can be more than just the System.* name, but a
          // full path-like structure, such as lib/netstandard2.0/System.Buffers.dll, so extract as needed:
          name = path.basename(fullName);
          runtimes[name] = version;
        }
      }
    }

    if (!runtimes) {
      throw new errors.FileNotProcessableError(
        `could not find any runtime dependencies in the ${target} dependency`,
      );
    }

    // Dig down into the specific runtimepack which contains all the assembly versions of
    // the bundled DLLs for the given runtime, as:
    // "runtimepack.Microsoft.NETCore.App.Runtime.osx-arm64/6.0.16": {
    //   "runtime": {
    //     "Microsoft.CSharp.dll": {
    //       "assemblyVersion": "6.0.0.0",
    //       "fileVersion": "6.0.1623.17311"
    //     },
    //     "Microsoft.VisualBasic.Core.dll": {
    //       "assemblyVersion": "11.0.0.0",
    //       "fileVersion": "11.100.1623.17311"
    //     },
    //  (...)
    // We currently only address assemblyVersions. FileVersion might become relevant, depending
    // on how vulnerabilities are reported in the future.
    runtimeAssemblyVersions[target] = Object.entries(
      runtimes as Versions,
    ).reduce((acc, [dll, versions]) => {
      // Take the version number (N.N.N.N) and remove the last element, in order for vulndb to understand anything.
      acc[dll] = versions.assemblyVersion.split('.').slice(0, -1).join('.');
      return acc;
    }, {});
  });

  if (isEmpty(runtimeAssemblyVersions)) {
    throw new errors.FileNotProcessableError(
      'collection of runtime assembly versions was empty, that should not happen',
    );
  }

  debug('finished extracting runtime assemblies from ' + filePath);

  // FIXME: This has been done to make the future easier, as we probably soon will need to support multiple
  //  RIDs. Currently, we are only looking at the first one.
  return Object.values(runtimeAssemblyVersions)[0];
}
