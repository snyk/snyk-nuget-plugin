import * as nugetParser from './nuget-parser';
import * as dotnet from './nuget-parser/cli/dotnet';
import * as path from 'path';
import * as paketParser from 'snyk-paket-parser';
import { ManifestType } from './nuget-parser/types';
import { legacyPlugin as pluginApi } from '@snyk/cli-interface';
import {
  CliCommandError,
  FileNotProcessableError,
  InvalidTargetFile,
} from './errors';
import { MultiProjectResult } from '@snyk/cli-interface/legacy/plugin';
import * as debugModule from 'debug';

const debug = debugModule('snyk');

// Surface the dotnet-missing fallback to the customer at most once per process —
// inspect() runs per project, so a multi-project scan would otherwise repeat it.
let dotnetFallbackWarned = false;

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

// Runs the dotnet-backed runtime resolution scan and shapes the result into a
// MultiProjectResult for the CLI or the SCM scanner. Requires the dotnet CLI.
async function buildRuntimeResolutionResult(
  root,
  targetFile,
  manifestType: ManifestType,
  options,
): Promise<MultiProjectResult> {
  const results = await nugetParser.buildDepGraphFromFiles(
    root,
    targetFile,
    manifestType,
    options['assets-project-name'],
    options['project-name-prefix'],
    options['dotnet-target-framework'],
  );

  return {
    plugin: {
      name: 'snyk-nuget-plugin',
      targetFile,
    },
    scannedProjects: results.map((result) => ({
      targetFile,
      depGraph: result.dependencyGraph,
      meta: {
        targetRuntime: result.targetFramework,
      },
    })),
  };
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
        targetRuntime: targetFramework,
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

  // Capture whether the customer explicitly requested runtime resolution before the
  // implicit, server-side enablement below can set it. An explicit request is a hard
  // requirement that must not be silently downgraded when dotnet is missing.
  const runtimeResolutionExplicitlyRequested =
    !!options['dotnet-runtime-resolution'];

  if (
    options.cliDotnetRuntimeResolutionEnabled &&
    manifestType === ManifestType.DOTNET_CORE &&
    options['dotnet-runtime-resolution'] === undefined
  ) {
    options['dotnet-runtime-resolution'] = true;
  }

  if (
    options['dotnet-target-framework'] &&
    !options['dotnet-runtime-resolution']
  ) {
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
          `runtime resolution flag is currently only supported for: .NET versions 6 and higher, all versions of .NET Core and all versions of .NET Standard projects. Supplied project type was parsed as ${manifestType}.`,
        ),
      );
    }

    // The runtime resolution flow depends on the dotnet CLI for restore, runtime
    // assembly resolution and target framework parsing. When dotnet is unavailable
    // (e.g. a CI step that runs after the build), fall back to the legacy scan of the
    // existing project.assets.json so we don't break environments that worked before
    // this flow was enabled.
    if (await dotnet.isInstalled()) {
      return buildRuntimeResolutionResult(
        root,
        targetFile,
        manifestType,
        options,
      );
    }

    // An explicit --dotnet-runtime-resolution request cannot be honoured without dotnet.
    // Fail loudly rather than silently returning a lower-fidelity legacy result.
    if (runtimeResolutionExplicitlyRequested) {
      return Promise.reject(
        new CliCommandError(
          'The --dotnet-runtime-resolution flag was set, but the dotnet CLI was not found on the PATH. Install the .NET SDK, or remove the flag to fall back to the legacy scan.',
        ),
      );
    }

    // Implicit (server-side) enablement: degrade to the legacy scan so we don't break
    // environments that worked before runtime resolution was enabled for them.
    if (!dotnetFallbackWarned) {
      dotnetFallbackWarned = true;
      console.warn(
        `\x1b[33m⚠ WARNING\x1b[0m: The dotnet CLI was not found on your PATH. Falling back to a static scan for SDK-style .NET projects — results will not include runtime dependency resolution and may be less complete. Install the .NET SDK and ensure dotnet is on your PATH for full results.`,
      );
    }

    if (options['dotnet-target-framework']) {
      debug(
        'the dotnet-target-framework flag is ignored when falling back to the legacy scan.',
      );
    }

    // fall through to the legacy scan below.
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
