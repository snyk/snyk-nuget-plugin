import * as fs from 'fs';
import * as path from 'path';
import * as csProjParser from './parsers/csproj-parser';
import * as debugModule from 'debug';
import * as depsParser from 'dotnet-deps-parser';
import * as dotnetCoreV3Parser from './parsers/dotnet-core-v3-parser';
import * as dotnetCoreParser from './parsers/dotnet-core-parser';
import * as dotnetFrameworkParser from './parsers/dotnet-framework-parser';
import * as projectJsonParser from './parsers/project-json-parser';
import * as packagesConfigParser from './parsers/packages-config-parser';
import {
  CliCommandError,
  FileNotProcessableError,
  InvalidManifestError,
  NotSupportedEcosystem,
} from '../errors';
import {
  AssemblyVersions,
  DotnetCoreV2Results,
  ManifestType,
  ProjectAssets,
  TargetFramework,
  TargetFrameworkInfo,
  Overrides,
} from './types';
import * as dotnet from './cli/dotnet';
import * as nugetFrameworksParser from './csharp/nugetframeworks_parser';
import {
  extractSdkInfo,
  findLatestMatchingVersion,
  PACKAGE_OVERRIDES_FILE,
  PACKS_PATH,
} from './runtime-assembly-v2';

const debug = debugModule('snyk');

const PROJECTSDK = 'Microsoft.NET.Sdk';
const PROJECT_ASSETS_FILENAME = 'project.assets.json';

const PARSERS = {
  'dotnet-core': {
    depParser: dotnetCoreParser,
    fileContentParser: JSON,
  },
  'dotnet-core-v3': {
    depParser: dotnetCoreV3Parser,
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

async function resolveAssetsFilePath(
  root: string,
  targetFile: string,
): Promise<string> {
  const expectedAssetsFile = path.resolve(root, targetFile);

  if (fs.existsSync(expectedAssetsFile)) {
    return expectedAssetsFile;
  }

  const targetFileDir = path.dirname(expectedAssetsFile);
  const projectDir = path.dirname(targetFileDir);

  let projectFile: string | null = null;
  try {
    const files = fs.readdirSync(projectDir);
    const projectFiles = files.filter(
      (file) =>
        file.endsWith('.csproj') ||
        file.endsWith('.vbproj') ||
        file.endsWith('.fsproj'),
    );

    if (projectFiles.length > 0) {
      projectFile = path.resolve(projectDir, projectFiles[0]);
    }
  } catch (error) {
    throw new FileNotProcessableError(
      `Failed to scan project directory for .*proj files: ${error}`,
    );
  }

  if (!projectFile) {
    throw new FileNotProcessableError(
      `Could not find any .csproj, .vbproj, or .fsproj files in directory: ${projectDir}`,
    );
  }

  // Use MSBuild to get the correct BaseIntermediateOutputPath
  const baseIntermediatePath =
    await dotnet.getBaseIntermediateOutputPath(projectFile);
  if (!baseIntermediatePath) {
    throw new CliCommandError(
      `Could not determine BaseIntermediateOutputPath for project: ${projectFile}`,
    );
  }

  const resolvedPath = path.isAbsolute(baseIntermediatePath)
    ? baseIntermediatePath
    : path.resolve(projectDir, baseIntermediatePath);

  const assetsFile = path.resolve(resolvedPath, PROJECT_ASSETS_FILENAME);

  if (!fs.existsSync(assetsFile)) {
    throw new FileNotProcessableError(
      `project.assets.json not found at resolved path: ${assetsFile}. ` +
        `Ensure 'dotnet restore' has been run successfully.`,
    );
  }

  return assetsFile;
}

async function getResultsWithoutPublish(
  decidedTargetFrameworks: string[],
  projectPath: string,
  safeRoot: string,
  nugetFrameworksParserLocation: string,
  resolvedProjectName: string,
  projectAssets: ProjectAssets,
): Promise<DotnetCoreV2Results> {
  const parser = PARSERS['dotnet-core-v3'];

  const projectFolder = projectPath ? path.dirname(projectPath) : safeRoot;

  // Check if any target frameworks need runtime assembly overrides
  const needsRuntimeOverrides = decidedTargetFrameworks.some(
    (framework) =>
      !framework.includes('netstandard') && !framework.includes('netcoreapp'),
  );

  const overridesAssemblies: AssemblyVersions = {};

  // Only load runtime overrides if we have frameworks that need them (exclude netstandard and netcoreapp)
  if (needsRuntimeOverrides) {
    const { sdkVersion, sdkPath } = await extractSdkInfo(projectFolder);
    const localRuntimes = await dotnet.execute(
      ['--list-runtimes'],
      projectFolder,
    );
    const runtimeVersion = findLatestMatchingVersion(localRuntimes, sdkVersion);

    try {
      const overridesPath: string = `${path.dirname(sdkPath)}${PACKS_PATH}${runtimeVersion}/${PACKAGE_OVERRIDES_FILE}`;
      const overridesText: string = fs.readFileSync(overridesPath, 'utf-8');
      for (const pkg of overridesText.split('\n')) {
        if (pkg) {
          const [name, version] = pkg.split('|');
          // Trim any carriage return
          overridesAssemblies[name] = version.trim();
        }
      }
    } catch (err) {
      throw new FileNotProcessableError(
        `Failed to read PackageOverrides.txt, error: ${err}`,
      );
    }
  }

  // Loop through all TargetFrameworks supplied and generate a dependency graph for each.
  const results: DotnetCoreV2Results = [];
  for (const decidedTargetFramework of decidedTargetFrameworks) {
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

    const overrides: Overrides = {
      overridesAssemblies,
      // .NET Standard and .NET Core App frameworks don't need runtime assembly overrides
      // as they don't provide specific runtime assembly information that can be read more precisely
      // than what's available in the project.assets.json file.
      overrideVersion:
        decidedTargetFramework.includes('netstandard') ||
        decidedTargetFramework.includes('netcoreapp')
          ? undefined
          : targetFrameworkInfo.Version.split('.').slice(0, -1).join('.'),
    };

    let targetFramework = decidedTargetFramework;
    if (targetFrameworkInfo.Framework === '.NETStandard') {
      targetFramework = targetFrameworkInfo.DotNetFrameworkName;
    }

    const depGraph = parser.depParser.parse(
      resolvedProjectName,
      targetFramework,
      projectAssets,
      overrides,
    );

    results.push({
      dependencyGraph: depGraph,
      targetFramework: decidedTargetFramework,
    });
  }

  return results;
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

  // Resolve the correct assets file path using MSBuild if needed
  const fileContentPath = await resolveAssetsFilePath(safeRoot, safeTargetFile);
  const fileContent = getFileContents(fileContentPath);

  const parser = PARSERS['dotnet-core-v3'];
  const projectAssets: ProjectAssets =
    parser.fileContentParser.parse(fileContent);

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
    console.warn(`\x1b[33m⚠ WARNING\x1b[0m: Supplied targetframework \x1b[1m${targetFramework}\x1b[0m was not detected in the supplied 
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
  // Passing a const value as the project sdk. Why? The targetFile it's project.assets.json, which gets generated
  // only for the sdk style projects. The assets file won't get generated for projects which rely on packages.config.
  // The reason behind deciding to call this method is because maybe in the future we want to not support some specific
  // target frameworks.
  const decidedTargetFrameworks = targetFramework
    ? [targetFramework]
    : targetFrameworks.filter((framework) =>
        depsParser.isSupportedByV3GraphGeneration(framework, PROJECTSDK),
      );

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
    console.warn(
      `\x1b[33m⚠ WARNING\x1b[0m: Could not detect any projectPath in the project assets file, if your solution contains multiple projects in the same folder, this operation might fail.`,
    );
  }

  return getResultsWithoutPublish(
    decidedTargetFrameworks,
    projectPath,
    safeRoot,
    nugetFrameworksParserLocation,
    resolvedProjectName,
    projectAssets,
  );
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

  if (manifestType === ManifestType.PROJECT_JSON) {
    let json: any;
    try {
      json = JSON.parse(fileContent);
    } catch (err) {
      throw new FileNotProcessableError(`Failed to parse project.json: ${err}`);
    }

    const hasAnyRequiredProp = [
      'dependencies',
      'frameworks',
      'runtimes',
      'supports',
    ].some((prop) => prop in json);
    if (!hasAnyRequiredProp) {
      throw new NotSupportedEcosystem(
        'project.json file is not a valid project.json file',
      );
    }
  }

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
