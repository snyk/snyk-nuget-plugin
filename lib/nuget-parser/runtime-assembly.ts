import { AssemblyVersions } from './types';
import * as errors from '../errors/';
import * as fs from 'fs';
import { isEmpty } from 'lodash';
import * as debugModule from 'debug';

const debug = debugModule('snyk');

type Targets = Record<string, object>;

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
  let runtimeAssemblyVersions: AssemblyVersions = {};
  Object.entries(deps.targets as Targets).forEach(([target, dependencies]) => {
    // Ignore target frameworks without dependencies, as they hold no dlls and thus no assembly versions to gauge.
    if (isEmpty(dependencies)) {
      return;
    }

    // Since we're running `dotnet publish` with `--use-current-runtime`, this should exist in the dependency list,
    // but guard against it to ensure good user feedback in case we did something wrong.
    const runtimePack = Object.keys(dependencies).find((dep) =>
      dep.startsWith('runtimepack'),
    );

    if (!runtimePack) {
      throw new errors.FileNotProcessableError(
        `could not find any runtimepack.* identifier in the ${target} dependency`,
      );
    }

    // The runtimepack contains all the current RuntimeIdentifier (RID) assemblies which we are interested in.
    // Such as
    //   "runtimepack.Microsoft.NETCore.App.Runtime.osx-arm64/6.0.16": {
    //         "runtime": {
    //           "Microsoft.CSharp.dll": { .. assembly version 6.0.0 }
    //          }
    //   }
    // We traverse all those and store them for the dependency graph build.
    if (!('runtime' in dependencies[runtimePack])) {
      throw new errors.FileNotProcessableError(
        `could not find any runtime list in the ${runtimePack} dependency`,
      );
    }

    const runtimes = dependencies[runtimePack]['runtime'];

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
    runtimeAssemblyVersions = Object.entries(runtimes as Versions).reduce(
      (acc, [dll, versions]) => {
        // Take the version number (N.N.N.N) and remove the last element, in order for vulndb to understand anything.
        acc[dll] = versions.assemblyVersion.split('.').slice(0, -1).join('.');
        return acc;
      },
      {},
    );

    // `dotnet publish` does not support multiple consecutive `--runtime` parameters, so there should really only
    // be one. Thus, drop iterating more.
    return;
  });

  if (isEmpty(runtimeAssemblyVersions)) {
    throw new errors.FileNotProcessableError(
      'collection of runtime assembly versions was empty, that should not happen',
    );
  }

  debug('finished extracting runtime assemblies from ' + filePath);

  return runtimeAssemblyVersions;
}
