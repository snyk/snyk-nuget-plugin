import * as debugModule from 'debug';
import * as depGraphLib from '@snyk/dep-graph';
import { DepGraphBuilder } from '@snyk/dep-graph';
import { AssemblyVersions } from '../types';
import { FileNotProcessableError } from '../../errors';

const debug = debugModule('snyk');

interface ProjectAssets {
  project: any;
  targets: any;
}

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
const FILTERED_DEPENDENCY_PREFIX = ['runtime'];

function recursivelyPopulateNodes(
  depGraphBuilder: DepGraphBuilder,
  targetDeps: Record<string, DotnetPackage>,
  node: DotnetPackage,
  runtimeAssembly?: AssemblyVersions,
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

    // If we've supplied runtime assembly versions for self-contained dlls, overwrite the dependency version
    // we've found in the graph with those from the runtime assembly, as they take precedence.
    let assemblyVersion = version;
    if (runtimeAssembly) {
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
      localVisited,
    );
  }
}

function buildGraph(
  projectName: string,
  projectAssets: ProjectAssets,
  runtimeAssembly?: AssemblyVersions,
): depGraphLib.DepGraph {
  const depGraphBuilder = new DepGraphBuilder(
    { name: 'nuget' },
    {
      name: projectName,
      version: projectAssets.project.version,
    },
  );

  if (Object.keys(projectAssets.project.frameworks).length <= 0) {
    throw new FileNotProcessableError(
      'no target frameworks found in assets file',
    );
  }

  const targetFramework = Object.keys(projectAssets.project.frameworks)[0]; // FIXME: Multiple frameworks
  const topLevelDeps = Object.keys(
    projectAssets.project.frameworks[targetFramework].dependencies,
  );

  // The list of targets gets decorated differently depending on version of the TargetFramework, (.NET 5+ versions
  // just have their key as the target (net6.0), but .NET Standard append a version, such as .NETStandard,Version=VN.N.N).
  if (Object.keys(projectAssets.targets).length <= 0) {
    throw new FileNotProcessableError(
      'no target dependencies in found in assets file',
    );
  }

  // FIXME: As mentioned all over the place, we just access the first target framework we come across. There should be
  //  at least one, regardless.
  const targetFrameworkDependencies = Object.values(
    projectAssets.targets,
  )[0] as Record<string, DotnetPackage>;

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
      targetDep.startsWith(topLevelDepName),
    );
    if (!nameWithVersion) {
      throw new Error(
        "cant find a name and a version in assets file, something's very malformed",
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
  runtimeAssembly?: AssemblyVersions,
): depGraphLib.DepGraph {
  debug('Trying to parse .net core manifest with v2 depGraph builder');

  let result;
  if (!runtimeAssembly) {
    result = buildGraph(projectName, projectAssets);
  } else {
    result = buildGraph(projectName, projectAssets, runtimeAssembly);
  }
  return result;
}
