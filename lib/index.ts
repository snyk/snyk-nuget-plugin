import * as path from 'path';
import * as nugetParser from './nuget-parser';
import * as paketParser from 'snyk-paket-parser';
import { InvalidTargetFile } from './errors';

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
  root: string,
  targetFile: string,
  options: {
    dev?: boolean;
    strict?: boolean;
    packagesFolder?: string;
    assetsProjectName?: boolean;
    projectNamePrefix?: string;
  } = {},
) {
  let manifestType;
  try {
    manifestType = determineManifestType(path.basename(targetFile || root));
  } catch (error) {
    return Promise.reject(error);
  }

  const createPackageTree = depTree => {
    // TODO implement for paket and more than one framework
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
        options.dev,
        options.strict,
      )
      .then(createPackageTree);
  }
  return nugetParser
    .buildDepTreeFromFiles(
      root,
      targetFile,
      options.packagesFolder,
      manifestType,
      options.assetsProjectName,
      options.projectNamePrefix,
    )
    .then(createPackageTree);
}
