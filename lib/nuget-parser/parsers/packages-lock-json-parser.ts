import { InvalidManifestError } from '../../errors';
import * as debugModule from 'debug';
import type { Dependency } from '../types';

const debug = debugModule('snyk');

const PACKAGE_DELIMITER = '@';

// Questions:
// - Should runtime deps be filtered? -> currently yes
// - Should we deduplicate dependencies that show up multiple times? -> currently yes
// - How to handle dependencies with a version range (only happens for "Projects" types) -> currently using the first matching name
//       "Jellyfin.Common": {
//         "type": "Project",
//         "dependencies": {
//           "Jellyfin.Model": "[10.11.0, )",
//           "Microsoft.Extensions.Configuration.Abstractions": "[9.0.4, )",
//           "Microsoft.Extensions.DependencyInjection.Abstractions": "[9.0.4, )"
//         }
//       },

// Dependencies that starts with these are discarded
export const FILTERED_DEPENDENCY_PREFIX = [
  // `runtime` and `runtime.native` are a bit of a hot topic, see more https://github.com/dotnet/core/issues/7568.
  // For our case, we are already creating the correct dependencies and their respective runtime version numbers based
  // of our runtime resolution logic. So a dependency will already be `System.Net.Http@8.0.0` if running on .NET 8, thus
  // removing the need for a `runtime.native.System.Net.Http@8.0.0` as well. From our investigation these runtime native
  // dependencies are causing noise for the customers and are not of interested.
  'runtime',
];

type DepVersion = { name: string; version: string };

type DepFlatList = {
  name: string;
  version: string;
  dependencies: DepVersion[];
};

type DepTree = {
  [name: string]: {
    name: string;
    version: string;
    dependencies: DepTree;
  }
}

type DependencyType = 'Transitive' | 'Project' | 'CentralTransitive' | 'Direct';

interface Lockfile {
  dependencies: {
    [framework: string]: {
      [dependency: string]: {
        type: DependencyType;
        resolved: string | undefined;
        dependencies:
          | {
              [name: string]: string;
            }
          | undefined;
      };
    };
  };
}

function findDependency(
  dependencies: {
    [nameAndVersion: string]: DepFlatList;
  },
  dependency: DepVersion,
): DepFlatList | undefined {
  // Exact version match.
  if (dependencies[`${dependency.name}${PACKAGE_DELIMITER}${dependency.version}`] !== undefined) {
    return dependencies[`${dependency.name}${PACKAGE_DELIMITER}${dependency.version}`];
  }

  // First version match.
  return Object.values(dependencies)
    .filter(({ name }) => name === dependency.name)
    .shift();
}

function buildBfsTree(
  dependencies: {
    [nameAndVersion: string]: DepFlatList;
  },
  rootDependencies: DepVersion[],
): DepTree {
  const tree: DepTree = {};

  const queue: {
    parent: typeof tree;
    subDependency: DepVersion;
  }[] = [];

  for (const rootDependency of rootDependencies) {
    queue.push({ parent: tree, subDependency: rootDependency });
  }

  const knownDependencies: string[] = [];
  while (queue.length !== 0) {
    const { subDependency, parent } = queue.shift()!;
    // Ignore packages with specific prefixes, which for one reason or the other are no interesting and pollutes the
    // graph. Refer to comments on the individual elements in the ignore list for more information.
    if (
      FILTERED_DEPENDENCY_PREFIX.some((prefix) =>
        subDependency.name.startsWith(prefix),
      )
    ) {
      debug(`${subDependency} matched a prefix we ignore, not adding to graph`);
      continue;
    }

    const dependency = findDependency(dependencies, subDependency);
    if (!dependency) {
      debug(`Dependency ${subDependency.name} not found`);
      continue;
    }

    const subDependencies = {};
    parent[dependency.name] = {
      name: dependency.name,
      version: dependency.version,
      dependencies: subDependencies,
    };

    if (
      knownDependencies.includes(
        `${subDependency.name}${PACKAGE_DELIMITER}${subDependency.version}`,
      )
    ) {
      continue;
    }
    knownDependencies.push(`${subDependency.name}${PACKAGE_DELIMITER}${subDependency.version}`);

    for (const subDependency of dependency.dependencies) {
      queue.push({
        parent: subDependencies,
        subDependency: subDependency,
      });
    }
  }

  return tree;
}

function getFrameworkToRun(manifest: Lockfile): string {
  const frameworks = Object.keys(manifest.dependencies);

  debug(`Available frameworks: '${frameworks}'`);

  // not yet supporting multiple frameworks in the same file ->
  // taking only the first 1
  const selectedFrameworkKey = frameworks[0];
  debug(`Selected framework: '${selectedFrameworkKey}'`);

  return selectedFrameworkKey;
}

function parseManifest(manifest: any): Lockfile {
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !manifest.dependencies ||
    typeof manifest.dependencies !== 'object' ||
    Object.keys(manifest.dependencies).length === 0
  ) {
    throw new InvalidManifestError(
      '0 frameworks were found in packages.lock.json',
    );
  }

  for (const frameworkDependencies of Object.values(manifest.dependencies)) {
    if (!frameworkDependencies || typeof frameworkDependencies !== 'object') {
      throw new InvalidManifestError(
        'invalid dependency format found in packages.lock.json',
      );
    }

    for (const dependency of Object.values(frameworkDependencies)) {
      if (
        !dependency ||
        typeof dependency.type !== 'string' ||
        !['Transitive', 'Project', 'CentralTransitive', 'Direct'].includes(
          dependency.type,
        ) ||
        (dependency.dependencies !== undefined &&
          typeof dependency.dependencies !== 'object') ||
        (dependency.type !== 'Project' &&
          typeof dependency.resolved !== 'string')
      ) {
        throw new InvalidManifestError(
          'invalid dependency format found in packages.lock.json',
        );
      }

      if (dependency.dependencies !== undefined) {
        for (const value of Object.values(dependency.dependencies)) {
          if (typeof value !== 'string') {
            throw new InvalidManifestError(
              'invalid dependency version found in packages.lock.json',
            );
          }
        }
      }
    }
  }

  return manifest;
}

export function parse(
  tree: {
    meta: { targetFramework: string | undefined };
    dependencies: { [dependency: string]: Dependency };
  },
  fileContent: unknown,
) {
  debug('Trying to parse packages.lock.json format manifest');

  const manifest = parseManifest(fileContent);

  // If a targetFramework was not found in the proj file, we will extract it from the lock file
  // OR
  // If the targetFramework is undefined, extract it from the lock file
  // Fix for https://github.com/snyk/snyk-nuget-plugin/issues/75
  if (
    !tree.meta.targetFramework ||
    manifest.dependencies[tree.meta.targetFramework] === undefined
  ) {
    tree.meta.targetFramework = getFrameworkToRun(manifest);
  }

  const dependencies = Object.fromEntries(
    Object.entries(manifest.dependencies[tree.meta.targetFramework]).map(
      ([name, info]) => [
        `${name}${PACKAGE_DELIMITER}${info.resolved}`,
        {
          name,
          version: info.resolved || 'no-version',
          type: info.type,
          dependencies: Object.entries(info?.dependencies || []).map(
            ([name, version]) => ({
              name,
              version,
            }),
          ),
        },
      ],
    ),
  );

  const rootDependencies = Object.entries(dependencies)
    .filter(([, info]) => ['Direct'].includes(info.type))
    .map(([, info]) => ({ name: info.name, version: info.version }));

  tree.dependencies = buildBfsTree(dependencies, rootDependencies);

  return tree;
}
