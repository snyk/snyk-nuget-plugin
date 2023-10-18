import * as fs from 'fs';
import * as path from 'path';
import * as csProjParser from './parsers/csproj-parser';
import * as debugModule from 'debug';
import * as depsParser from 'dotnet-deps-parser';
import * as dotnetCoreParser from './parsers/dotnet-core-parser';
import * as dotnetCoreV2Parser from './parsers/dotnet-core-v2-parser';
import * as dotnetFrameworkParser from './parsers/dotnet-framework-parser';
import * as projectJsonParser from './parsers/project-json-parser';
import * as packagesConfigParser from './parsers/packages-config-parser';
import { FileNotProcessableError, InvalidManifestError } from '../errors';
import {
  DotnetCoreV2Results,
  ManifestType,
  ProjectAssets,
  TargetFramework,
  TargetFrameworkInfo,
} from './types';
import * as dotnet from './cli/dotnet';
import * as nugetFrameworksParser from './csharp/nugetframeworks_parser';
import * as runtimeAssembly from './runtime-assembly';

const debug = debugModule('snyk');

const PARSERS = {
  'dotnet-core': {
    depParser: dotnetCoreParser,
    fileContentParser: JSON,
  },
  'dotnet-core-v2': {
    depParser: dotnetCoreV2Parser,
    fileContentParser: JSON,
  },
  'packages.config': {
    depParser: dotnetFrameworkParser,
    fileContentParser: packagesConfigParser,
  },
  'project.json': {
    depParser: dotnetFrameworkParser,
    fileContentParser: projectJsonParser,
  },
};

function getPackagesFolder(packagesFolder, projectRootFolder) {
  if (packagesFolder) {
    return path.resolve(process.cwd(), packagesFolder);
  }
  return path.resolve(projectRootFolder, 'packages');
}

function getRootName(
  root?: string,
  projectRootFolder?: string,
  projectNamePrefix?: string,
): string {
  const defaultRootName = path.basename(root || projectRootFolder || '');
  if (projectNamePrefix) {
    return projectNamePrefix + defaultRootName;
  }
  return defaultRootName;
}

function getFileContents(fileContentPath: string): string {
  try {
    debug(`Parsing content of ${fileContentPath}`);
    return fs.readFileSync(fileContentPath, 'utf-8');
  } catch (error: unknown) {
    throw new FileNotProcessableError(error);
  }
}

export async function buildDepGraphFromFiles(
  root: string | undefined,
  targetFile: string | undefined,
  manifestType: ManifestType,
  useProjectNameFromAssetsFile: boolean,
  projectNamePrefix?: string,
  targetFramework?: string,
): Promise<DotnetCoreV2Results> {
  const safeRoot = root || '.';
  const safeTargetFile = targetFile || '.';
  const fileContentPath = path.resolve(safeRoot, safeTargetFile);
  const fileContent = getFileContents(fileContentPath);
  const projectRootFolder = path.resolve(fileContentPath, '../../');

  const parser = PARSERS['dotnet-core-v2'];
  const manifest: ProjectAssets =
    await parser.fileContentParser.parse(fileContent);

  if (!manifest.project?.frameworks) {
    throw new FileNotProcessableError(
      `unable to detect any target framework in manifest file ${safeTargetFile}, a valid one is needed to continue down this path.`,
    );
  }

  const targetFrameworks = Object.keys(manifest.project.frameworks);
  if (targetFrameworks.length <= 0) {
    throw new FileNotProcessableError(
      `unable to detect a target framework in ${projectRootFolder}, a valid one is needed to continue down this path.`,
    );
  }

  if (targetFramework && !targetFrameworks.includes(targetFramework)) {
    console.log(`\x1b[33m⚠ WARNING\x1b[0m: Supplied targetframework \x1b[1m${targetFramework}\x1b[0m was not detected in the supplied 
manifest file. Available targetFrameworks detected was \x1b[1m${targetFrameworks.join(
      ',',
    )}\x1b[0m. 
Will attempt to build dependency graph anyway, but the operation might fail.`);
  }

  let resolvedProjectName = getRootName(
    root,
    projectRootFolder,
    projectNamePrefix,
  );

  const projectNameFromManifestFile = manifest?.project?.restore?.projectName;
  if (
    manifestType === ManifestType.DOTNET_CORE &&
    useProjectNameFromAssetsFile
  ) {
    if (projectNameFromManifestFile) {
      resolvedProjectName = projectNameFromManifestFile;
    } else {
      debug(
        `project.assets.json file doesn't contain a value for 'projectName'. Using default value: ${resolvedProjectName}`,
      );
    }
  }
  // If a specific targetFramework has been requested, only query that, otherwise try to do them all
  const decidedTargetFrameworks = targetFramework
    ? [targetFramework]
    : targetFrameworks.filter((framework) => {
        if (!depsParser.isSupportedByV2GraphGeneration(framework)) {
          console.log(
            `\x1b[33m⚠ WARNING\x1b[0m: runtime resolution flag is currently only supported for: .NET versions 5 and higher, all versions of .NET Core and all versions of .NET Standard projects. Supplied version was parsed as: ${framework}, which will be skipped.`,
          );
          return false;
        }
        return true;
      });

  const results: DotnetCoreV2Results = [];
  for (const decidedTargetFramework of decidedTargetFrameworks) {
    // Ensure `dotnet` is installed on the system or fail trying.
    await dotnet.validate();

    // Run `dotnet publish` to create a self-contained publishable binary with included .dlls for assembly version inspection.
    const publishDir = await dotnet.publish(
      projectRootFolder,
      decidedTargetFramework,
    );

    // Then inspect the dependency graph for the runtimepackage's assembly versions.
    const depsFile = path.resolve(
      publishDir,
      `${projectNameFromManifestFile}.deps.json`,
    );
    const assemblyVersions =
      runtimeAssembly.generateRuntimeAssemblies(depsFile);

    // Parse the TargetFramework using Nuget.Frameworks itself, instead of trying to reinvent the wheel, thus ensuring
    // we have maximum context to use later when building the depGraph.
    const location = nugetFrameworksParser.generate();
    await dotnet.restore(location);
    const response = await dotnet.run(location, [decidedTargetFramework]);
    const targetFrameworkInfo: TargetFrameworkInfo = JSON.parse(response);
    if (targetFrameworkInfo.IsUnsupported) {
      throw new InvalidManifestError(
        `dotnet was not able to parse the target framework ${decidedTargetFramework}, it was reported unsupported by the dotnet runtime`,
      );
    }

    const depGraph = parser.depParser.parse(
      resolvedProjectName,
      manifest,
      assemblyVersions,
      targetFrameworkInfo,
    );
    results.push({
      dependencyGraph: depGraph,
      targetFramework: decidedTargetFramework,
    });
  }

  return results;
}

export async function buildDepTreeFromFiles(
  root: string | undefined,
  targetFile: string | undefined,
  packagesFolderPath: string | undefined,
  manifestType: ManifestType,
  useProjectNameFromAssetsFile: boolean,
  projectNamePrefix?: string,
) {
  const safeRoot = root || '.';
  const safeTargetFile = targetFile || '.';
  const fileContentPath = path.resolve(safeRoot, safeTargetFile);
  const fileContent = getFileContents(fileContentPath);
  const projectRootFolder = path.resolve(fileContentPath, '../../');
  const packagesFolder = getPackagesFolder(
    packagesFolderPath,
    projectRootFolder,
  );

  const tree = {
    dependencies: {},
    meta: {},
    name: getRootName(root, projectRootFolder, projectNamePrefix),
    packageFormatVersion: 'nuget:0.0.0',
    version: '0.0.0',
  };

  let targetFrameworks: TargetFramework[];
  try {
    if (manifestType === ManifestType.DOTNET_CORE) {
      targetFrameworks =
        csProjParser.getTargetFrameworksFromProjFile(projectRootFolder);
    } else {
      // .csproj is in the same directory as packages.config or project.json
      const fileContentParentDirectory = path.resolve(fileContentPath, '../');
      targetFrameworks = csProjParser.getTargetFrameworksFromProjFile(
        fileContentParentDirectory,
      );

      // finally, for the .NETFramework project, try to assume the framework using dotnet-deps-parser
      if (targetFrameworks.length <= 0) {
        // currently only process packages.config files
        if (manifestType === ManifestType.PACKAGES_CONFIG) {
          const minimumTargetFramework =
            await packagesConfigParser.getMinimumTargetFramework(fileContent);
          if (minimumTargetFramework) {
            targetFrameworks = [minimumTargetFramework];
          }
        }
      }
    }
  } catch (error: unknown) {
    return Promise.reject(error);
  }

  // TODO: OSM-347 - use more than just the first one we find
  const targetFramework =
    targetFrameworks.length > 0 ? targetFrameworks[0].original : undefined;
  tree.meta = {
    targetFramework: targetFramework,
  };

  const parser = PARSERS[manifestType];
  const manifest = await parser.fileContentParser.parse(fileContent, tree);

  if (
    manifestType === ManifestType.DOTNET_CORE &&
    useProjectNameFromAssetsFile
  ) {
    const projectName = manifest?.project?.restore?.projectName;

    if (projectName) {
      tree.name = projectName;
    } else {
      debug(
        "project.assets.json file doesn't contain a value for 'projectName'. Using default value: " +
          tree.name,
      );
    }
  }

  return parser.depParser.parse(
    tree,
    manifest,
    targetFramework,
    packagesFolder,
  );
}
