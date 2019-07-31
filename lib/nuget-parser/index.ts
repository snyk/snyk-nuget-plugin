import * as fs from 'fs';
import * as path from 'path';
import {getTargetFrameworksFromProjFile} from './csproj-parser';
import * as _ from 'lodash';
import * as debugModule from 'debug';
const debug = debugModule('snyk');

import * as dotnetCoreParser from './dotnet-core-parser';
import * as dotnetFrameworkParser from './dotnet-framework-parser';
import * as projectJsonParser from './project-json-parser';
import * as packagesConfigParser from './packages-config-parser';
import {FileNotProcessableError} from '../errors';

const PARSERS = {
  'dotnet-core': {
    depParser: dotnetCoreParser,
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

export async function buildDepTreeFromFiles(
  root,
  targetFile,
  packagesFolderPath,
  manifestType,
  useProjectNameFromAssetsFile) {
  const fileContentPath = path.resolve(root || '.', targetFile || '.');
  let fileContent;
  try {
    debug(`Parsing content of ${fileContentPath}`);
    fileContent = fs.readFileSync(fileContentPath, 'utf-8');
  } catch (error) {
    throw new FileNotProcessableError(error);
  }
  const projectRootFolder = path.resolve(fileContentPath, '../../');
  const packagesFolder = getPackagesFolder(packagesFolderPath, projectRootFolder);

  const tree = {
    dependencies: {},
    meta: {},
    name: path.basename(root || projectRootFolder),
    packageFormatVersion: 'nuget:0.0.0',
    version: '0.0.0',
  };

  let targetFramework;
  try {
    if (manifestType === 'dotnet-core') {
      targetFramework = await getTargetFrameworksFromProjFile(projectRootFolder);
    } else {
      // .csproj is in the same directory as packages.config or project.json
      targetFramework = await getTargetFrameworksFromProjFile(path.resolve(fileContentPath, '../'));
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
    const projectName = _.get(manifest, 'project.restore.projectName');
    if (projectName) {
      tree.name = projectName;
    } else {
      debug("project.assets.json file doesn't contain a value for 'projectName'. Using default value: " + tree.name);
    }
  }

  return parser.depParser.parse(
    tree,
    manifest,
    targetFramework,
    packagesFolder);
}
