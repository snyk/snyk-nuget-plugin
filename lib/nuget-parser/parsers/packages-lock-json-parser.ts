import { InvalidManifestError } from '../../errors';
import * as debugModule from 'debug';
import type { Dependency } from '../types';

const debug = debugModule('snyk');

const PACKAGE_DELIMITER = '@';

// Questions:
// - Should runtime deps be filtered out? -> currently yes
// - Should we deduplicate dependencies that show up multiple times? -> currently no
// - How to handle dependencies with a version range (only happens for "Projects" types) -> currently using the first matching name
//       "Jellyfin.Common": {
//         "type": "Project",
//         "dependencies": {
//           "Jellyfin.Model": "[10.11.0, )",
//           "Microsoft.Extensions.Configuration.Abstractions": "[9.0.4, )",
//           "Microsoft.Extensions.DependencyInjection.Abstractions": "[9.0.4, )"
//         }
//       },
// - Should frequent dependencies be appended in the tree under `freqSystemDependencies`? -> currently yes

const SKIP_DUPLICATED_PACKAGE_DEPENDENCIES = false;

// Dependencies that starts with these are discarded.
export const FILTERED_DEPENDENCY_PREFIX = [
  // `runtime` and `runtime.native` are a bit of a hot topic, see more https://github.com/dotnet/core/issues/7568.
  // For our case, we are already creating the correct dependencies and their respective runtime version numbers based
  // of our runtime resolution logic. So a dependency will already be `System.Net.Http@8.0.0` if running on .NET 8, thus
  // removing the need for a `runtime.native.System.Net.Http@8.0.0` as well. From our investigation these runtime native
  // dependencies are causing noise for the customers and are not of interested.
  'runtime',
];

// These dependencies are discarded.
const FREQUENT_DEPENDENCIES = new Set([
  'Microsoft.NETCore.Platforms',
  'Microsoft.NETCore.Targets',
  'System.Runtime',
  'System.IO',
  'System.Text.Encoding',
  'System.Threading.Tasks',
  'System.Reflection',
  'System.Globalization',
]);

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
  };
};

const DEPENDENCY_TYPES = [
  'Transitive',
  'Project',
  'CentralTransitive',
  'Direct',
];
type DependencyType = (typeof DEPENDENCY_TYPES)[number];

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
  return (
    dependencies[
      `${dependency.name}${PACKAGE_DELIMITER}${dependency.version}`
    ] ||
    // Name match.
    dependencies[dependency.name]
  );
}

function getRootFrequentDependencies(root: DepTree): DepTree {
  if (root['freqSystemDependencies'] === undefined) {
    root['freqSystemDependencies'] = {
      name: 'freqSystemDependencies',
      version: '0.0.0',
      dependencies: {},
    };
  }

  return root['freqSystemDependencies'].dependencies;
}

function buildBfsTree(
  dependencies: {
    [nameAndVersion: string]: DepFlatList;
  },
  rootDependencies: DepVersion[],
): DepTree {
  const tree: DepTree = {};

  // Initialise the queue with root dependencies.
  const queue = rootDependencies.map((rootDep) => ({
    parent: tree,
    subDependency: rootDep,
  }));

  const knownDependencies: string[] = [];
  while (queue.length !== 0) {
    const { subDependency, parent } = queue.shift()!;
    // Ignore packages with specific prefixes.
    if (
      FILTERED_DEPENDENCY_PREFIX.some((prefix) =>
        subDependency.name.startsWith(prefix),
      )
    ) {
      debug(
        `Dependency ${subDependency} matched a prefix we ignore, not adding to graph`,
      );
      continue;
    }

    const dependency = findDependency(dependencies, subDependency);
    if (!dependency) {
      debug(`Dependency ${subDependency.name} not found`);
      continue;
    }

    const subDependencies: DepTree = {};
    parent[dependency.name] = {
      name: dependency.name,
      version: dependency.version,
      dependencies: subDependencies,
    };

    if (
      SKIP_DUPLICATED_PACKAGE_DEPENDENCIES &&
      knownDependencies.includes(
        `${subDependency.name}${PACKAGE_DELIMITER}${subDependency.version}`,
      )
    ) {
      // Include the duplicated dependency itself but not its dependencies, to avoid very large graphs.
      continue;
    } else if (SKIP_DUPLICATED_PACKAGE_DEPENDENCIES) {
      knownDependencies.push(
        `${subDependency.name}${PACKAGE_DELIMITER}${subDependency.version}`,
      );
    }

    for (const subDependency of dependency.dependencies) {
      queue.push({
        // Hoist frequent dependencies under the root node rather than nested under their parent.
        parent: FREQUENT_DEPENDENCIES.has(subDependency.name)
          ? getRootFrequentDependencies(tree)
          : subDependencies,
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

function parseManifest(manifest: unknown): asserts manifest is Lockfile {
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !('dependencies' in manifest) ||
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
        typeof dependency !== 'object' ||
        // Check the dependency type matches the known list.
        !('type' in dependency) ||
        typeof dependency.type !== 'string' ||
        !DEPENDENCY_TYPES.includes(dependency.type) ||
        // Optional property "dependencies" is an object.
        ('dependencies' in dependency &&
          !(
            dependency.dependencies &&
            typeof dependency.dependencies === 'object'
          )) ||
        // All non-"Project" dependencies must have a "resolved" version.
        (dependency.type !== 'Project' &&
          !(
            'resolved' in dependency && typeof dependency.resolved === 'string'
          ))
      ) {
        throw new InvalidManifestError(
          'invalid dependency format found in packages.lock.json',
        );
      }

      if (
        'dependencies' in dependency &&
        !!dependency.dependencies &&
        typeof dependency.dependencies === 'object'
      ) {
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
}

function buildDependencies(
  manifest: Lockfile,
  targetFramework: string,
): {
  [nameAndVersion: string]: {
    name: string;
    version: string;
    type: DependencyType;
    dependencies: DepVersion[];
  };
} {
  return Object.fromEntries(
    Object.entries(manifest.dependencies[targetFramework]).flatMap(
      ([name, info]) => {
        const packageInfo = {
          name,
          version: info.resolved || 'no-version',
          type: info.type,
          dependencies: Object.entries(info?.dependencies || []).map(
            ([name, version]) => ({
              name,
              version,
            }),
          ),
        };

        return [
          [
            // Index dependencies by name@version.
            `${name}${PACKAGE_DELIMITER}${info.resolved}`,
            packageInfo,
          ],
          [
            // And by name for when no exact version match is found ("Projects" dependencies can have a range instead).
            name,
            packageInfo,
          ],
        ];
      },
    ),
  );
}

export function parse(
  tree: {
    meta: { targetFramework: string | undefined };
    dependencies: { [dependency: string]: Dependency };
  },
  fileContent: unknown,
): typeof tree {
  debug('Trying to parse packages.lock.json format manifest');

  parseManifest(fileContent);

  // If a targetFramework was not found in the proj file, we will extract it from the lock file
  // OR
  // If the targetFramework is undefined, extract it from the lock file
  // Fix for https://github.com/snyk/snyk-nuget-plugin/issues/75
  if (
    !tree.meta.targetFramework ||
    fileContent.dependencies[tree.meta.targetFramework] === undefined
  ) {
    tree.meta.targetFramework = getFrameworkToRun(fileContent);
  }

  const dependencies = buildDependencies(
    fileContent,
    tree.meta.targetFramework,
  );

  const rootDependencies = Object.values(dependencies).filter((info) =>
    ['Direct'].includes(info.type),
  );

  tree.dependencies = buildBfsTree(dependencies, rootDependencies);

  return tree;
}
