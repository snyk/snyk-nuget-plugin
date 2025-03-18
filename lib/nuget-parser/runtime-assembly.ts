import { AssemblyVersions, PublishedProjectDeps } from './types';
import * as errors from '../errors/';
import { isEmpty } from 'lodash';
import * as debugModule from 'debug';

const debug = debugModule('snyk');

// For the difference between the two, see:
// https://learn.microsoft.com/en-us/troubleshoot/developer/visualstudio/general/assembly-version-assembly-file-version
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
// And https://github.com/dotnet/sdk/blob/main/documentation/specs/runtime-configuration-file.md for the official
// explanation of what the `deps.json` file is doing that we are traversing.
export function generateRuntimeAssemblies(
  deps: PublishedProjectDeps,
): AssemblyVersions {
  const runtimeTargetName = deps.runtimeTarget.name;

  debug(`extracting runtime assemblies from ${runtimeTargetName}`);

  if (!deps.targets) {
    throw new errors.FileNotProcessableError(
      'could not find any targets in deps file',
    );
  }

  if (!(runtimeTargetName in deps.targets)) {
    throw new errors.FileNotProcessableError(
      `could not locate ${runtimeTargetName} in list of targets, cannot continue`,
    );
  }

  // Run through all runtimepacks in target, indexed for example as
  // runtimepack.Microsoft.NETCore.App.Runtime.osx-arm64/7.0.14
  // runtimepack.Microsoft.AspNetCore.App.Runtime.osx-arm64/7.0.14
  // ... etc.
  // See all: https://github.com/dotnet/runtime/blob/bd83e17052d3c09022bad1d91dca860ca6b27ab9/src/libraries/Microsoft.NETCore.Platforms/src/runtime.json
  let runtimeAssemblyVersions: AssemblyVersions = {};

  const runtimePacks = Object.keys(deps.targets[runtimeTargetName]).filter(
    (t) => t.startsWith('runtimepack'),
  );
  if (runtimePacks.length <= 0) {
    throw new errors.FileNotProcessableError(
      `could not find any runtimepack.* identifiers in ${runtimeTargetName}, cannot continue`,
    );
  }

  runtimePacks.forEach((runtimePack) => {
    const dependencies = deps.targets[runtimeTargetName][runtimePack];
    // The runtimepack contains all the current RuntimeIdentifier (RID) assemblies which we are interested in.
    // Such as
    //   "runtimepack.Microsoft.NETCore.App.Runtime.osx-arm64/6.0.16": {
    //         "runtime": {
    //           "Microsoft.CSharp.dll": { .. assembly version 6.0.0 }
    //          }
    //   }
    // We traverse all those and store them for the dependency graph build.
    if (!('runtime' in dependencies)) {
      throw new errors.FileNotProcessableError(
        `could not find any runtime list in the ${runtimePack} dependency`,
      );
    }

    const runtimes = dependencies['runtime'];

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
    runtimeAssemblyVersions = {
      ...runtimeAssemblyVersions,
      ...Object.entries(runtimes as Versions).reduce((acc, [dll, versions]) => {
        // Take the version number (N.N.N.N) and remove the last element, in order for vulndb to understand anything.
        acc[dll] = versions.assemblyVersion.split('.').slice(0, -1).join('.');
        return acc;
      }, {}),
    };
  });

  if (isEmpty(runtimeAssemblyVersions)) {
    throw new errors.FileNotProcessableError(
      'collection of runtime assembly versions was empty, that should not happen',
    );
  }

  debug(`finished extracting runtime assemblies from ${runtimeTargetName}`);

  return runtimeAssemblyVersions;
}
