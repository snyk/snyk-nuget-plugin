import { InvalidManifestError } from '../../errors';
import * as debugModule from 'debug';
import type { Dependency } from '../types';

const debug = debugModule('snyk');

type DependencyType = 'Transitive' | 'Project' | 'CentralTransitive' | 'Direct';

interface Lockfile {
  dependencies: {
    [framework: string]: {
      [dependency: string]: {
        type: DependencyType;
        resolved: string;
        dependencies: {
          [name: string]: string;
        };
      };
    };
  };
}

function buildBfsTree(
  dependencies: {
    [nameAndVersion: string]: {
      name: string;
      version: string;
      dependencies: string[];
    };
  },
  rootNameAndVersions: string[],
): { [dependency: string]: Dependency } {
  const tree: { [name: string]: Dependency } = {};

  const queue: { parent: typeof tree; nameAndVersion: string }[] = [];
  for (const rootNameAndVersion of rootNameAndVersions) {
    queue.push({ parent: tree, nameAndVersion: rootNameAndVersion });
  }

  const knownDependencies: string[] = [];
  while (queue.length !== 0) {
    const { nameAndVersion, parent } = queue.shift()!;
    if (knownDependencies.includes(nameAndVersion)) {
      continue;
    } else {
      knownDependencies.push(nameAndVersion);
    }

    const dependency = dependencies[nameAndVersion];
    if (!dependency) {
      debug(`Dependency ${nameAndVersion} not found`);
      continue;
    }

    const subDependencies = {};
    parent[dependency.name] = {
      name: dependency.name,
      version: dependency.version,
      dependencies: subDependencies,
    };

    for (const subDependency of dependency.dependencies) {
      queue.push({
        parent: subDependencies,
        nameAndVersion: subDependency,
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
        `${name}@${info.resolved}`,
        {
          name,
          version: info.resolved,
          type: info.type,
          dependencies: Object.entries(info?.dependencies || []).map(
            ([name, version]) => `${name}@${version}`,
          ),
        },
      ],
    ),
  );

  const rootDependencies = Object.entries(dependencies)
    .filter(([, info]) => ['Direct'].includes(info.type))
    .map(([nameAndVersion]) => nameAndVersion);

  tree.dependencies = buildBfsTree(dependencies, rootDependencies);

  return tree;
}
