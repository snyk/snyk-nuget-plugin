import * as fs from 'fs';
import * as path from 'path';
import { getTargetFrameworksFromProjFile } from './csproj-parser';
import * as debugModule from 'debug';
import * as dotnetCoreParser from './dotnet-core-parser';
import * as dotnetCoreV2Parser from './dotnet-core-v2-parser';
import * as dotnetFrameworkParser from './dotnet-framework-parser';
import * as projectJsonParser from './project-json-parser';
import * as packagesConfigParser from './packages-config-parser';
import { FileNotProcessableError } from '../errors';
import { TargetFramework } from './types';
import * as depsParser from 'dotnet-deps-parser';
import { toReadableFramework } from './framework';
import * as depGraphLib from '@snyk/dep-graph';

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
  } catch (error) {
    throw new FileNotProcessableError(error);
  }
}

export async function buildDepGraphFromFiles(
  root: string | undefined,
  targetFile: string | undefined,
  manifestType,
  useProjectNameFromAssetsFile,
  projectNamePrefix?: string,
): Promise<{
  depGraph: depGraphLib.DepGraph;
  targetFramework: string | undefined;
}> {
  const safeRoot = root || '.';
  const safeTargetFile = targetFile || '.';
  const fileContentPath = path.resolve(safeRoot, safeTargetFile);
  const fileContent = getFileContents(fileContentPath);
  const projectRootFolder = path.resolve(fileContentPath, '../../');
  const targetFramework = await getTargetFrameworksFromProjFile(
    projectRootFolder,
  );

  const parser = PARSERS['dotnet-core-v2'];
  const manifest = await parser.fileContentParser.parse(fileContent);

  let resolvedProjectName = getRootName(
    root,
    projectRootFolder,
    projectNamePrefix,
  );
  if (manifestType === 'dotnet-core' && useProjectNameFromAssetsFile) {
    const projectName = manifest?.project?.restore?.projectName;
    if (projectName) {
      resolvedProjectName = projectName;
    } else {
      debug(
        "project.assets.json file doesn't contain a value for 'projectName'. Using default value: " +
          resolvedProjectName,
      );
    }
  }

  const depGraph = parser.depParser.parse(resolvedProjectName, manifest);

  return {
    depGraph,
    targetFramework: targetFramework?.original,
  };
}

export async function buildDepTreeFromFiles(
  root: string | undefined,
  targetFile: string | undefined,
  packagesFolderPath,
  manifestType,
  useProjectNameFromAssetsFile,
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

  let targetFramework: TargetFramework | undefined;
  try {
    if (manifestType === 'dotnet-core') {
      targetFramework = await getTargetFrameworksFromProjFile(
        projectRootFolder,
      );
    } else {
      // .csproj is in the same directory as packages.config or project.json
      const fileContentParentDirectory = path.resolve(fileContentPath, '../');
      targetFramework = await getTargetFrameworksFromProjFile(
        fileContentParentDirectory,
      );

      // finally, for the .NETFramework project, try to assume the framework using dotnet-deps-parser
      if (!targetFramework) {
        // currently only process packages.config files
        if (manifestType === 'packages.config') {
          targetFramework = await getMinimumTargetFrameworkFromPackagesConfig(
            fileContent,
          );
        }
      }
    }
  } catch (error) {
    return Promise.reject(error);
  }

  tree.meta = {
    targetFramework: targetFramework ? targetFramework.original : undefined, // TODO implement for more than one TF
  };

  const parser = PARSERS[manifestType];
  const manifest = await parser.fileContentParser.parse(fileContent, tree);

  if (manifestType === 'dotnet-core' && useProjectNameFromAssetsFile) {
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

export async function getMinimumTargetFrameworkFromPackagesConfig(
  fileContent: string,
): Promise<TargetFramework | undefined> {
  const extractedFrameworks =
    await depsParser.extractTargetFrameworksFromProjectConfig(fileContent);

  if (extractedFrameworks && extractedFrameworks.length > 0) {
    const minimumFramework = extractedFrameworks.reduce((prev, curr) =>
      prev < curr ? prev : curr,
    );
    return toReadableFramework(minimumFramework);
  }

  return undefined;
}
