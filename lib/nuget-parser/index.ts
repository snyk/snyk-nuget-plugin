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
import {
  CliCommandError,
  FileNotProcessableError,
  InvalidManifestError,
} from '../errors';
import {
  AssemblyVersions,
  DotnetCoreV2Results,
  ManifestType,
  ProjectAssets,
  PublishedProjectDeps,
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

// `dotnet` can publish the .deps file to a variety of places inside the publish folder, depending on what you're
// including and targeting. Instead of trying different directories, just scan them all. In most cases, the file
// will be in the root directory. (See https://github.com/Azure/azure-functions-vs-build-sdk/issues/518)
function findDepsFilePathInPublishDir(dir: string): string | null {
  for (const item of fs.readdirSync(dir)) {
    const itemPath = path.join(dir, item);

    // The file is usually <project>.deps.json, but in edge cases, `dotnet` names it for you.
    if (itemPath.endsWith('deps.json')) {
      return itemPath;
    }

    if (!fs.statSync(itemPath).isDirectory()) {
      continue;
    }

    // Otherwise, look in a nested dir for the same thing.
    const foundFilePath = findDepsFilePathInPublishDir(itemPath);
    if (!foundFilePath) {
      continue;
    }

    return foundFilePath;
  }

  return null;
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

  const parser = PARSERS['dotnet-core-v2'];
  const projectAssets: ProjectAssets =
    await parser.fileContentParser.parse(fileContent);

  if (!projectAssets.project?.frameworks) {
    throw new FileNotProcessableError(
      `unable to detect any target framework in manifest file ${safeTargetFile}, a valid one is needed to continue down this path.`,
    );
  }

  // Scan all 'frameworks' detected in the project.assets.json file, and use the targetAlias if detected and
  // otherwise the raw key name, as it's not guaranteed that all framework objects contains a targetAlias.
  const targetFrameworks = Object.entries(projectAssets.project.frameworks).map(
    ([key, value]) => ('targetAlias' in value ? value.targetAlias : key),
  );

  if (targetFrameworks.length <= 0) {
    throw new FileNotProcessableError(
      `unable to detect a target framework in ${safeTargetFile}, a valid one is needed to continue down this path.`,
    );
  }

  if (targetFramework && !targetFrameworks.includes(targetFramework)) {
    console.log(`\x1b[33m⚠ WARNING\x1b[0m: Supplied targetframework \x1b[1m${targetFramework}\x1b[0m was not detected in the supplied 
manifest file. Available targetFrameworks detected was \x1b[1m${targetFrameworks.join(
      ',',
    )}\x1b[0m. 
Will attempt to build dependency graph anyway, but the operation might fail.`);
  }

  let resolvedProjectName = getRootName(root, safeRoot, projectNamePrefix);

  const projectNameFromManifestFile =
    projectAssets?.project?.restore?.projectName;
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
            `\x1b[33m⚠ WARNING\x1b[0m: The runtime resolution flag is currently only supported for the following TargetFrameworks: .NET versions 5 and higher, all versions of .NET Core and all versions of .NET Standard. Detected a TargetFramework: \x1b[1m${framework}\x1b[0m, which will be skipped.`,
          );
          return false;
        }
        return true;
      });

  if (decidedTargetFrameworks.length == 0) {
    throw new InvalidManifestError(
      `Was not able to find any supported TargetFrameworks to scan, aborting`,
    );
  }

  // Ensure `dotnet` is installed on the system or fail trying.
  await dotnet.validate();

  // Write a .NET Framework Parser to a temporary directory for validating TargetFrameworks.
  const nugetFrameworksParserLocation = nugetFrameworksParser.generate();
  await dotnet.restore(nugetFrameworksParserLocation);

  // Access the path of this project, to ensure we get the right .csproj file, in case of multiples present
  const projectPath = projectAssets.project.restore.projectPath;
  if (!projectPath) {
    console.log(
      `\x1b[33m⚠ WARNING\x1b[0m: Could not detect any projectPath in the project assets file, if your solution contains multiple projects in the same folder, this operation might fail.`,
    );
  }

  // Loop through all TargetFrameworks supplied and generate a dependency graph for each.
  const results: DotnetCoreV2Results = [];
  for (const decidedTargetFramework of decidedTargetFrameworks) {
    // Run `dotnet publish` to create a self-contained publishable binary with included .dlls for assembly version inspection.
    const publishDir = await dotnet.publish(
      // Attempt to feed it the full path to the project file itself, as multiple could exist. If that fails, don't break the flow, just send the folder as previously
      projectPath || safeRoot,
      decidedTargetFramework,
    );

    // Then inspect the dependency graph for the runtimepackage's assembly versions.
    const filename = `${projectNameFromManifestFile}.deps.json`;
    const depsFilePath = findDepsFilePathInPublishDir(publishDir);
    if (!depsFilePath) {
      throw new CliCommandError(
        `unable to locate ${filename} anywhere inside ${publishDir}, file is needed for runtime resolution to occur, aborting`,
      );
    }

    const depsFile = fs.readFileSync(depsFilePath);
    const publishedProjectDeps: PublishedProjectDeps = JSON.parse(
      depsFile.toString('utf-8'),
    );

    let assemblyVersions: AssemblyVersions = {};
    // Specifically targeting .NET Standard frameworks will not provide any specific runtime assembly information in
    // the published artifacts files, and can thus not be read more precisely than the .deps file will tell us up-front.
    // This probably makes sense when looking at https://dotnet.microsoft.com/en-us/platform/dotnet-standard#versions.
    // As such, we don't generate any runtime assemblies and generate the dependency graph without it.
    if (!decidedTargetFramework.includes('netstandard')) {
      assemblyVersions =
        runtimeAssembly.generateRuntimeAssemblies(publishedProjectDeps);
    }

    // Parse the TargetFramework using Nuget.Frameworks itself, instead of trying to reinvent the wheel, thus ensuring
    // we have maximum context to use later when building the depGraph.
    const response = await dotnet.run(nugetFrameworksParserLocation, [
      decidedTargetFramework,
    ]);
    const targetFrameworkInfo: TargetFrameworkInfo = JSON.parse(response);
    if (targetFrameworkInfo.IsUnsupported) {
      throw new InvalidManifestError(
        `dotnet was not able to parse the target framework ${decidedTargetFramework}, it was reported unsupported by the dotnet runtime`,
      );
    }

    const depGraph = parser.depParser.parse(
      resolvedProjectName,
      projectAssets,
      publishedProjectDeps,
      assemblyVersions,
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

  // Only supports the first targetFramework we find.
  // Use the newer `buildDepGraphFromFiles` for better support for multiple target frameworks.
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
