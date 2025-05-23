import * as debugModule from 'debug';
import * as depGraphLib from '@snyk/dep-graph';
import { DepGraphBuilder } from '@snyk/dep-graph';
import { InvalidManifestError } from '../../errors';
import { ProjectAssets, Target } from '../types';

const debug = debugModule('snyk');

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
  allPackagesForFramework: Record<string, Target>,
  parentID: string,
  dependencies: Record<string, string> | undefined,
  visited: Set<string>,
) {
  if (!dependencies) {
    return;
  }

  for (const [childName, childResolvedVersion] of Object.entries(
    dependencies,
  )) {
    const localVisited = visited || new Set<string>();
    // Ignore packages with specific prefixes
    if (
      FILTERED_DEPENDENCY_PREFIX.some((prefix) => childName.startsWith(prefix))
    ) {
      debug(`${childName} matched a prefix we ignore, not adding to graph`);
      continue;
    }

    const childPkgEntry =
      allPackagesForFramework[`${childName}/${childResolvedVersion}`];
    if (!childPkgEntry) {
      debug(
        `Child package ${childName} not found in lock file packages for framework.`,
      );
      continue; // Skip if child package details are missing
    }

    const childID = `${childName}@${childResolvedVersion}`;

    // Check if this package (name@resolvedVersion) has already been added to the graph
    if (localVisited.has(childID)) {
      // If visited, add a pruned node and connect it
      const prunedID = `${childID}:pruned`; // Append :pruned to the ID
      depGraphBuilder.addPkgNode(
        { name: childName, version: childResolvedVersion },
        prunedID,
        {
          labels: { pruned: 'true' },
        },
      );
      depGraphBuilder.connectDep(parentID, prunedID);
      debug(`Pruning duplicate dependency: ${parentID} -> ${childID}`);
      continue; // Do not traverse dependencies of pruned nodes
    }

    // If not visited, add the full node and connect it
    depGraphBuilder.addPkgNode(
      { name: childName, version: childResolvedVersion },
      childID,
    );
    depGraphBuilder.connectDep(parentID, childID);
    localVisited.add(childID); // Mark as visited

    debug(`Adding dependency: ${parentID} -> ${childID}`);

    recursivelyPopulateNodes(
      depGraphBuilder,
      allPackagesForFramework,
      childID,
      childPkgEntry.dependencies,
      localVisited,
    );
  }
}

function buildDepGraph(
  projectName: string,
  targetFramework: string,
  projectAssets: ProjectAssets,
): depGraphLib.DepGraph {
  const depGraphBuilder = new DepGraphBuilder(
    { name: 'nuget' },
    {
      name: projectName,
      version: projectAssets.project.version,
    },
  );

  if (!targetFramework) {
    // This should ideally not happen if validateManifest and parse are called first
    throw new InvalidManifestError(
      'Target framework not found in lock file metadata.',
    );
  }

  const allPackagesForFramework = projectAssets.targets[targetFramework];

  if (!allPackagesForFramework) {
    // This should ideally not happen if validateManifest and parse are called first
    throw new InvalidManifestError(
      `Target framework '${targetFramework}' not found in packages.lock.json dependencies.`,
    );
  }

  // Identify direct dependencies for the selected framework
  const directDependencies: Record<string, string> = {};
  projectAssets.projectFileDependencyGroups[targetFramework].forEach(
    (dependency: string) => {
      const dependencySplit = dependency.split(' ');
      directDependencies[dependencySplit[0]] = dependencySplit[2];
    },
  );

  debug(
    `Direct dependencies found in lock file for ${targetFramework}: '${Object.keys(directDependencies)}'`,
  );

  if (Object.keys(directDependencies).length === 0) {
    debug(
      'No direct dependencies found in project.assets.json for the selected framework.',
    );
    // Return a graph with just the root if no direct dependencies
    return depGraphBuilder.build();
  }

  const visited = new Set<string>();

  // Start recursive population from direct dependencies
  recursivelyPopulateNodes(
    depGraphBuilder,
    allPackagesForFramework,
    'root-node',
    directDependencies, // Pass the direct dependencies object
    visited,
  );

  return depGraphBuilder.build();
}

function validateManifest(manifest: ProjectAssets) {
  if (!manifest.project) {
    throw new InvalidManifestError(
      'Project field was not found in project.assets.json',
    );
  }

  if (!manifest.project.frameworks) {
    throw new InvalidManifestError(
      'No frameworks were found in project.assets.json',
    );
  }

  if (
    !manifest.project.frameworks ||
    Object.keys(manifest.project.frameworks).length === 0
  ) {
    throw new InvalidManifestError(
      '0 frameworks were found in project.assets.json',
    );
  }

  if (!manifest.targets) {
    throw new InvalidManifestError(
      'No targets were found in project.assets.json',
    );
  }

  if (!manifest.targets || Object.keys(manifest.targets).length === 0) {
    throw new InvalidManifestError(
      '0 targets were found in project.assets.json',
    );
  }
}

export function parse(
  projectName: string,
  targetFramework: string,
  projectAssets: ProjectAssets,
): depGraphLib.DepGraph {
  debug(
    'Trying to parse project.assets.json manifest with v2 depGraph builder',
  );

  validateManifest(projectAssets);

  return buildDepGraph(projectName, targetFramework, projectAssets);
}
