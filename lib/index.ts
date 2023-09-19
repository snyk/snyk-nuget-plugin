import * as nugetParser from './nuget-parser';
import * as path from 'path';
import * as paketParser from 'snyk-paket-parser';
import { ManifestType } from './nuget-parser/types';
import { legacyPlugin as pluginApi } from '@snyk/cli-interface';
import {
  CliCommandError,
  FileNotProcessableError,
  InvalidTargetFile,
} from './errors';

function determineManifestType(filename: string): ManifestType {
  switch (true) {
    case /project.json$/.test(filename): {
      return ManifestType.PROJECT_JSON;
    }
    case /project.assets.json$/.test(filename): {
      return ManifestType.DOTNET_CORE;
    }
    case /packages.config$/.test(filename): {
      return ManifestType.PACKAGES_CONFIG;
    }
    case /paket.dependencies$/.test(filename): {
      return ManifestType.PAKET;
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
): Promise<pluginApi.InspectResult> {
  options = options || {};
  let manifestType: ManifestType;
  try {
    manifestType = determineManifestType(path.basename(targetFile || root));
  } catch (error: unknown) {
    return Promise.reject(error);
  }

  const createPackageTree = (depTree): pluginApi.SinglePackageResult => {
    const targetFramework = depTree.meta
      ? depTree.meta.targetFramework
      : undefined;
    delete depTree.meta;
    return {
      package: depTree,
      plugin: {
        name: 'snyk-nuget-plugin',
        targetFile,
        runtime: targetFramework,
      },
    };
  };

  if (manifestType === ManifestType.PAKET) {
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

  if (options['target-framework'] && !options['dotnet-runtime-resolution']) {
    return Promise.reject(
      new CliCommandError(
        'target framework flag is currently only supported when also scanning with runtime resolution using the `--dotnet-runtime-resolution` flag',
      ),
    );
  }

  if (options['dotnet-runtime-resolution']) {
    if (manifestType !== ManifestType.DOTNET_CORE) {
      return Promise.reject(
        new FileNotProcessableError(
          `runtime resolution flag is currently only supported for: .NET versions 5 and higher, all versions of .NET Core and all versions of .NET Standard projects. Supplied project type was parsed as ${manifestType}.`,
        ),
      );
    }

    console.log(`
\x1b[33m⚠ WARNING\x1b[0m: Testing a .NET project with runtime resolution enabled. 
This should be considered experimental and not relied upon for production use.
Please report issues with this beta feature by submitting a support ticket, and attach the output of running this command
with the debug (-d) flag at \x1b[4mhttps://support.snyk.io/hc/en-us/requests/new\x1b[0m.`);

    const result = await nugetParser.buildDepGraphFromFiles(
      root,
      targetFile,
      manifestType,
      options['assets-project-name'],
      options['project-name-prefix'],
      options['target-framework'],
    );
    return {
      dependencyGraph: result.dependencyGraph,
      plugin: {
        name: 'snyk-nuget-plugin',
        targetFile,
        runtime: result.targetFramework,
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
