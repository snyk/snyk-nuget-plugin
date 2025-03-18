import * as debugModule from 'debug';
import * as depGraphLib from '@snyk/dep-graph';
import { DepGraphBuilder } from '@snyk/dep-graph';
import {
  AssemblyVersions,
  ProjectAssets,
  PublishedProjectDeps,
} from '../types';
import { InvalidManifestError } from '../../errors';

const debug = debugModule('snyk');

interface DotnetPackage {
  type: string;
  dependencies?: Record<string, string>;
  runtime?: object;
  compile: object;
  // Not from assets.json, but injected during building of graph for easy access.
  name: string;
  version: string;
}

// Dependencies that starts with these are discarded
export const FILTERED_DEPENDENCY_PREFIX = [
  // `runtime` and `runtime.native` are a bit of a hot topic, see more https://github.com/dotnet/core/issues/7568.
  // For our case, we are already creating the correct dependencies and their respective runtime version numbers based
  // of our runtime resolution logic. So a dependency will already be `System.Net.Http@8.0.0` if running on .NET 8, thus
  // removing the need for a `runtime.native.System.Net.Http@8.0.0` as well. From our investigation these runtime native
  // dependencies are causing noise for the customers and are not of interested.
  'runtime',
];

function recursivelyPopulateNodes(
  depGraphBuilder: DepGraphBuilder,
  targetDeps: Record<string, DotnetPackage>,
  node: DotnetPackage,
  runtimeAssembly: AssemblyVersions,
  useFixForImprovedDotnetFalsePositives: boolean,
  visited?: Set<string>,
) {
  const parentId =
    node.type === 'root' ? 'root-node' : `${node.name}@${node.version}`;

  for (const depNode of Object.entries(node.dependencies || {})) {
    const localVisited = visited || new Set<string>();
    const name = depNode[0];
    const version = depNode[1];

    // Ignore packages with specific prefixes, which for one reason or the other are no interesting and pollutes the
    // graph. Refer to comments on the individual elements in the ignore list for more information.
    if (FILTERED_DEPENDENCY_PREFIX.some((prefix) => name.startsWith(prefix))) {
      debug(`${name} matched a prefix we ignore, not adding to graph`);
      continue;
    }

    const childNode = {
      ...targetDeps[`${name}/${version}`],
      name,
      version,
    };

    const childId = `${childNode.name}@${childNode.version}`;

    // If we're looking at a runtime assembly version for self-contained dlls, overwrite the dependency version
    // we've found in the graph with those from the runtime assembly, as they take precedence.
    let assemblyVersion = version;

    if (useFixForImprovedDotnetFalsePositives) {
      if (name in runtimeAssembly) {
        assemblyVersion = runtimeAssembly[name];
      }
    } else {
      // The RuntimeAssembly type contains the name with a .dll suffix, as this is how .NET represents them in the
      // dependency file. This must be stripped in order to match the elements during depGraph construction.
      const dll = `${name}.dll`;
      if (dll in runtimeAssembly) {
        assemblyVersion = runtimeAssembly[dll];
      }
    }

    if (localVisited.has(childId)) {
      const prunedId = `${childId}:pruned`;
      depGraphBuilder.addPkgNode(
        { name: childNode.name, version: assemblyVersion },
        prunedId,
        {
          labels: { pruned: 'true' },
        },
      );
      depGraphBuilder.connectDep(parentId, prunedId);
      continue;
    }

    depGraphBuilder.addPkgNode(
      { name: childNode.name, version: assemblyVersion },
      childId,
    );
    depGraphBuilder.connectDep(parentId, childId);
    localVisited.add(childId);

    recursivelyPopulateNodes(
      depGraphBuilder,
      targetDeps,
      childNode,
      runtimeAssembly,
      useFixForImprovedDotnetFalsePositives,
      localVisited,
    );
  }
}

function getRestoredProjectName(
  publishedProjectDeps: PublishedProjectDeps,
  runtimeTarget: string,
  projectName: string,
) {
  return Object.keys(publishedProjectDeps.targets[runtimeTarget]).find((f) =>
    f.startsWith(projectName),
  );
}

function extractLocalProjects(libs: Record<string, any>): string[] {
  const localPackages: string[] = [];

  for (const [key, value] of Object.entries(libs)) {
    if (!key.includes('runtimepack')) {
      // Local projects (.csproj files) don't have values declared for these two properties.
      // https://github.com/dotnet/sdk/blob/main/documentation/specs/runtime-configuration-file.md#libraries-section-depsjson
      if (!value.serviceable && !value.sha512 && value.type === 'project') {
        localPackages.push(key);
      }
    }
  }

  return localPackages;
}

function getDllName(depName: string): string {
  return `${depName}.dll`;
}

function buildGraph(
  projectName: string,
  projectAssets: ProjectAssets,
  publishedProjectDeps: PublishedProjectDeps,
  runtimeAssembly: AssemblyVersions,
  useFixForImprovedDotnetFalsePositives: boolean,
): depGraphLib.DepGraph {
  const depGraphBuilder = new DepGraphBuilder(
    { name: 'nuget' },
    {
      name: projectName,
      version: projectAssets.project.version,
    },
  );

  // We publish to one RID and one only, so we can safely assume that the true dependencies will exist in this key.
  // E.g. targets -> .NETCoreApp,Version=v8.0/osx-arm64
  const runtimeTarget = publishedProjectDeps.runtimeTarget.name;

  // Those dependencies are referenced in the 'targets' member in the same .deps file.
  if (Object.keys(publishedProjectDeps.targets).length <= 0) {
    throw new InvalidManifestError(
      'no target dependencies in found in published deps file (project.deps.json -> targets -> []), cannot continue without that',
    );
  }

  if (!(runtimeTarget in publishedProjectDeps.targets)) {
    throw new InvalidManifestError(
      `no ${runtimeTarget} found in targets object, cannot continue without it`,
    );
  }

  // What `dotnet` wants to call this project is not always the same as what Snyk wants to call it, and the version
  // postfix is not the same as what's defined in `project.assets.json` due to NuGet version normalization, which is
  // not applied during publish, only during restore. So we have to rely on the fact that the name is enough.
  const restoreProjectName =
    getRestoredProjectName(
      publishedProjectDeps,
      runtimeTarget,
      projectAssets.project.restore.projectName,
    ) ||
    // Last attempt to find the target using the .csproj filename.
    // <PackageId> property overrides most of the naming when restoring, but when publishing, the actual filename is used as the target.
    getRestoredProjectName(publishedProjectDeps, runtimeTarget, projectName);

  if (!restoreProjectName) {
    throw new InvalidManifestError(
      `no project name containing ${projectAssets.project.restore.projectName} or ${projectName} found in ${runtimeTarget} object, cannot continue without it`,
    );
  }

  // Find names and versions of all dependencies of the root package. These are already structured correctly in
  // the deps.json generated by `dotnet publish`.
  const topLevelDepPackages: Record<string, string> =
    publishedProjectDeps.targets[runtimeTarget][restoreProjectName]
      .dependencies;

  // Iterate over all the dependencies found in the target dependency list, and build the depGraph based off of that.
  const targetDependencies: Record<string, DotnetPackage> = Object.entries(
    publishedProjectDeps.targets[runtimeTarget],
  ).reduce((acc, entry) => {
    const [nameWithVersion, pkg] = entry;
    return { ...acc, [nameWithVersion]: pkg };
  }, {});

  const rootNode = {
    type: 'root',
    dependencies: topLevelDepPackages,
  } as DotnetPackage;

  if (!useFixForImprovedDotnetFalsePositives) {
    // runtimeAssembly doesn't have entries if the target framework is `netstandard`
    if (Object.keys(runtimeAssembly).length > 0) {
      const localPackagesNames = extractLocalProjects(
        publishedProjectDeps.libraries,
      );

      const targets = publishedProjectDeps.targets[runtimeTarget];

      // Overwriting the runtime versions with the values used in local projects.
      for (const pgkName of localPackagesNames) {
        if (targets[pgkName]?.dependencies) {
          for (const [key, value] of Object.entries(
            targets[pgkName].dependencies,
          )) {
            const dllName = getDllName(key);
            if (runtimeAssembly[dllName]) {
              runtimeAssembly[dllName] = value as string;
            }
          }
        }
      }

      // Overwriting the runtime versions with the values used in fetched packages.
      for (const [key, value] of Object.entries(targets)) {
        if (value && Object.keys(value).length === 0) {
          const [depName, depVersion] = key.split('/');
          const dllName = getDllName(depName);
          // NuGet’s dependency resolution mechanism will choose the higher available version.
          if (
            runtimeAssembly[dllName] &&
            depVersion > runtimeAssembly[dllName]
          ) {
            runtimeAssembly[dllName] = depVersion as string;
          }
        }
      }
    }
  }

  recursivelyPopulateNodes(
    depGraphBuilder,
    targetDependencies,
    rootNode,
    runtimeAssembly,
    useFixForImprovedDotnetFalsePositives,
  );

  return depGraphBuilder.build();
}

export function parse(
  projectName: string,
  projectAssets: ProjectAssets,
  publishedProjectDeps: PublishedProjectDeps,
  runtimeAssembly: AssemblyVersions,
  useFixForImprovedDotnetFalsePositives: boolean,
): depGraphLib.DepGraph {
  debug('Trying to parse .net core manifest with v2 depGraph builder');

  const result = buildGraph(
    projectName,
    projectAssets,
    publishedProjectDeps,
    runtimeAssembly,
    useFixForImprovedDotnetFalsePositives,
  );
  return result;
}
