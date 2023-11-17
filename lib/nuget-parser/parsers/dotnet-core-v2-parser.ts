import * as debugModule from 'debug';
import * as depGraphLib from '@snyk/dep-graph';
import { DepGraphBuilder } from '@snyk/dep-graph';
import { AssemblyVersions, ProjectAssets, TargetFrameworkInfo } from '../types';
import { FileNotProcessableError, InvalidManifestError } from '../../errors';

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
export const FILTERED_DEPENDENCY_PREFIX = ['runtime'];

// The list of top level dependencies and transitive dependencies differ based on the target runtime we've defined.
// In the generated dependency file created by the `dotnet` CLI, this is organized by the target framework moniker (TFM).
// Unfortunately, Microsoft has changed the way it denominates their targets throughout the different versions,
// see: https://learn.microsoft.com/en-us/nuget/reference/target-frameworks#supported-frameworks.
// So the logic has to be unnecessarily complex, as we cannot just access the key in the target dictionary
// for versions different from the newest ones of .NET 5+.
// Even better, it changes between how it defines them inside project.frameworks and the root targets object interchangeably.
function findTargetFrameworkMonikerInManifest(
  targetFrameworkInfo: TargetFrameworkInfo,
  frameworks: Record<string, any>,
): string {
  const shortName = targetFrameworkInfo.ShortName;
  const longName = targetFrameworkInfo.DotNetFrameworkName;
  const parsedFrameworks = Object.keys(frameworks);
  debug(
    `parsed the following frameworks in the manifest file: ${parsedFrameworks.join(
      ',',
    )}`,
  );

  // Try and find the "longName" (or DotNetFrameworkName) in the list of targets.
  // The format is usually something like ".NETCoreApp,Version=v6.0". That seems to happen for older .NET target frameworks.
  if (longName in frameworks) {
    debug(`detected ${longName} in assets file, returning that`);
    return longName;
  }

  // If that doesn't work, for newer versions of .NET core, they index the frameworks object by the 'shortname'.
  if (shortName in frameworks) {
    debug(`detected ${shortName} in assets file, returning that`);
    return shortName;
  }

  throw new FileNotProcessableError(
    `unable to find the determined target framework (${targetFrameworkInfo.ShortName}) in any of the available target frameworks: ${parsedFrameworks}`,
  );
}

function recursivelyPopulateNodes(
  depGraphBuilder: DepGraphBuilder,
  targetDeps: Record<string, DotnetPackage>,
  node: DotnetPackage,
  runtimeAssembly: AssemblyVersions,
  visited?: Set<string>,
) {
  const parentId =
    node.type === 'root' ? 'root-node' : `${node.name}@${node.version}`;

  for (const depNode of Object.entries(node.dependencies || {})) {
    const localVisited = visited || new Set<string>();
    const name = depNode[0];
    const version = depNode[1];

    const childNode = {
      ...targetDeps[`${name}/${version}`],
      name,
      version,
    };

    const childId = `${childNode.name}@${childNode.version}`;

    // If we're looking at a  runtime assembly version for self-contained dlls, overwrite the dependency version
    // we've found in the graph with those from the runtime assembly, as they take precedence.
    let assemblyVersion = version;
    // The RuntimeAssembly type contains the name with a .dll suffix, as this is how .NET represents them in the
    // dependency file. This must be stripped in order to match the elements during depGraph construction.
    const dll = `${name}.dll`;
    if (dll in runtimeAssembly) {
      assemblyVersion = runtimeAssembly[dll];
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
      localVisited,
    );
  }
}

function buildGraph(
  projectName: string,
  projectAssets: ProjectAssets,
  runtimeAssembly: AssemblyVersions,
  targetFrameworkInfo: TargetFrameworkInfo,
): depGraphLib.DepGraph {
  const depGraphBuilder = new DepGraphBuilder(
    { name: 'nuget' },
    {
      name: projectName,
      version: projectAssets.project.version,
    },
  );

  if (Object.keys(projectAssets.project.frameworks).length <= 0) {
    throw new InvalidManifestError(
      'no target frameworks found in assets file (project.assets.json -> project -> frameworks -> []), cannot continue without that',
    );
  }

  // Access all top-level dependencies from the right target point in the project.assets.json, or fail trying.
  const directDepsMoniker = findTargetFrameworkMonikerInManifest(
    targetFrameworkInfo,
    projectAssets.project.frameworks,
  );

  // Potentially we're scanning a project that really has no dependencies
  if (!projectAssets.project.frameworks[directDepsMoniker].dependencies) {
    return depGraphBuilder.build();
  }

  // Those dependencies are referenced in the 'targets' member in the same assets file.
  const topLevelDeps = Object.keys(
    projectAssets.project.frameworks[directDepsMoniker].dependencies,
  );

  // The list of targets gets decorated differently depending on version of the TargetFramework, (.NET 5+ versions
  // just have their key as the target (net6.0), but .NET Standard append a version, such as .NETStandard,Version=VN.N.N).
  if (Object.keys(projectAssets.targets).length <= 0) {
    throw new InvalidManifestError(
      'no target dependencies in found in assets file (project.assets.json -> targets -> []), cannot continue without that',
    );
  }

  // Further, they decorate them differently depending on where in the assets file it is.
  // E.g., a direct dependency target moniker can be project -> frameworks -> 'netstandard2.0', while the
  // transitive dependency line can be targets -> .NETStandard,Version=v2.1.
  const transitiveDepsMoniker = findTargetFrameworkMonikerInManifest(
    targetFrameworkInfo,
    projectAssets.targets,
  );
  const targetFrameworkDependencies: Record<string, DotnetPackage> =
    projectAssets.targets[transitiveDepsMoniker];

  // Iterate over all the dependencies found in the target dependency list, and build the depGraph based off of that.
  const targetDeps: Record<string, DotnetPackage> = Object.entries(
    targetFrameworkDependencies,
  ).reduce((acc, entry) => {
    const [nameWithVersion, pkg] = entry;

    // Ignore packages with specific prefixes, which for one reason or the other are no interesting and pollutes the graph.
    if (
      FILTERED_DEPENDENCY_PREFIX.some((prefix) =>
        nameWithVersion.startsWith(prefix),
      )
    ) {
      return acc;
    }

    return { ...acc, [nameWithVersion]: pkg };
  }, {});

  const topLevelDepPackages = topLevelDeps.reduce((acc, topLevelDepName) => {
    const nameWithVersion = Object.keys(targetDeps).find((targetDep) =>
      // Lowercase the comparison, as .csproj <PackageReference>s are not case-sensitive, and can be written however you like.
      targetDep.toLowerCase().startsWith(topLevelDepName.toLowerCase()),
    );
    if (!nameWithVersion) {
      throw new InvalidManifestError(
        `cant find a name and a version in assets file, something's very malformed`,
      );
    }

    const [name, version] = nameWithVersion.split('/');

    return { ...acc, [name]: version };
  }, {});

  const rootNode = {
    type: 'root',
    dependencies: topLevelDepPackages,
  } as DotnetPackage;

  recursivelyPopulateNodes(
    depGraphBuilder,
    targetDeps,
    rootNode,
    runtimeAssembly,
  );

  return depGraphBuilder.build();
}

export function parse(
  projectName: string,
  projectAssets: ProjectAssets,
  runtimeAssembly: AssemblyVersions,
  targetFrameworkInfo: TargetFrameworkInfo,
): depGraphLib.DepGraph {
  debug('Trying to parse .net core manifest with v2 depGraph builder');

  const result = buildGraph(
    projectName,
    projectAssets,
    runtimeAssembly,
    targetFrameworkInfo,
  );
  return result;
}
