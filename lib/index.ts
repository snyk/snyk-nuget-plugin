import * as path from 'path';
import * as nugetParser from './nuget-parser';
import * as paketParser from 'snyk-paket-parser';
import { InvalidTargetFile } from './errors';
import { InspectResult } from './nuget-parser/types';

function determineManifestType(filename) {
  switch (true) {
    case /project.json$/.test(filename): {
      return 'project.json';
    }
    case /project.assets.json$/.test(filename): {
      return 'dotnet-core';
    }
    case /packages.config$/.test(filename): {
      return 'packages.config';
    }
    case /paket.dependencies$/.test(filename): {
      return 'paket';
    }
    default: {
      throw new InvalidTargetFile(
        'Could not determine manifest type for ' + filename,
      );
    }
  }
}

export async function inspect(
  root,
  targetFile,
  options?,
): Promise<InspectResult> {
  options = options || {};
  let manifestType;
  try {
    manifestType = determineManifestType(path.basename(targetFile || root));
  } catch (error) {
    return Promise.reject(error);
  }

  const createPackageTree = (depTree) => {
    const targetFramework = depTree.meta
      ? depTree.meta.targetFramework
      : undefined;
    delete depTree.meta;
    return {
      package: depTree,
      plugin: {
        name: 'snyk-nuget-plugin',
        targetFile,
        targetRuntime: targetFramework,
      },
    };
  };

  if (manifestType === 'paket') {
    return paketParser
      .buildDepTreeFromFiles(
        root,
        targetFile,
        path.join(path.dirname(targetFile), 'paket.lock'),
        options['include-dev'] || options.dev, // TODO: remove include-dev when no longer used.
        options.strict,
      )
      .then(createPackageTree);
  }

  if (options['dotnet-runtime-resolution']) {
    if (manifestType !== 'dotnet-core') {
      return Promise.reject(
        new Error(
          'runtime resolution beta flag is currently only applicable for .net core projects',
        ),
      );
    }

    const result = await nugetParser.buildDepGraphFromFiles(
      root,
      targetFile,
      manifestType,
      options['assets-project-name'],
      options['project-name-prefix'],
    );
    return {
      dependencyGraph: result.dependencyGraph,
      package: 'n/a', // TODO: Will remove when everything is ported to depGraphs
      plugin: {
        name: 'snyk-nuget-plugin',
        targetFile,
        targetRuntime: result.targetFramework,
      },
    };
  }

  return nugetParser
    .buildDepTreeFromFiles(
      root,
      targetFile,
      options.packagesFolder,
      manifestType,
      options['assets-project-name'],
      options['project-name-prefix'],
    )
    .then(createPackageTree);
}
