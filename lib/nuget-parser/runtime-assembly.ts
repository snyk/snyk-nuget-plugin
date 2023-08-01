import { AssemblyVersions, RuntimeAssemblyVersions } from './types';
import * as errors from '../errors/';
import * as fs from 'fs';
import { isEmpty } from 'lodash';

type Targets = Record<string, object>;

interface Versions {
  assemblyVersion: string;
  fileVersion: string;
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

    // The RuntimeIdentifier' (RID) dependencies are indexed in the target dependencies as a 'runtimepack'.
    // Find the first entry in the list of targets as:
    //  "your-top-level-project/1.0.0": {...},
    //  "Castle.Core/4.4.1": {...},
    //  "runtimepack.Microsoft.NETCore.App.Runtime.osx-arm64/6.0.16": {...},
    // ... etc.
    const [runtimePack, runtimeDependencies] =
      Object.entries(dependencies).find(([key]) =>
        key.toLowerCase().startsWith('runtimepack'),
      ) || [];

    if (!runtimePack) {
      throw new errors.FileNotProcessableError(
        `could not find any runtimepack.* targets in the ${target} dependency`,
      );
    }

    if (!runtimeDependencies || !('runtime' in runtimeDependencies)) {
      throw new errors.FileNotProcessableError(
        `could not find any runtime dependencies the ${target} dependency`,
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
      runtimeDependencies.runtime as Versions,
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

  // FIXME: This has been done to make the future easier, as we probably soon will need to support multiple
  //  RIDs. Currently, we are only looking at the first one.
  return Object.values(runtimeAssemblyVersions)[0];
}
