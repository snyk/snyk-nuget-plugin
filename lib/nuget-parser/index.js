'use strict';
const fs = require('fs');
const path = require('path');
const debug = require('debug')('snyk');
const getTargetFrameworkFromProjFile = require('./csproj-parser');
const _ = require('lodash');

const dotnetCoreParser = require('./dotnet-core-parser');
const dotnetFrameworkParser = require('./dotnet-framework-parser');
const projectJsonParser = require('./project-json-parser');
const packagesConfigParser = require('./packages-config-parser');

const PARSERS = {
  'dotnet-core': {
    depParser: dotnetCoreParser,
    fileContentParser: JSON,
  },
  'project.json': {
    depParser: dotnetFrameworkParser,
    fileContentParser: projectJsonParser,
  },
  'packages.config': {
    depParser: dotnetFrameworkParser,
    fileContentParser: packagesConfigParser,
  },
};

function getPackagesFolder(packagesFolder, projectRootFolder) {
  if (packagesFolder) {
    return path.resolve(process.cwd(), packagesFolder);
  }
  return path.resolve(projectRootFolder, 'packages');
}

module.exports = {
  buildDepTreeFromFiles: function (root, targetFile, packagesFolderPath, manifestType, useProjectNameFromAssetsFile) {
    const fileContentPath = path.resolve(root || '.', targetFile || '.');
    let fileContent;
    try {
      fileContent = fs.readFileSync(fileContentPath).toString();
    } catch (error) {
      return Promise.reject(error);
    }
    const projectRootFolder = path.resolve(fileContentPath, '../../');
    const packagesFolder = getPackagesFolder(packagesFolderPath, projectRootFolder);

    const tree = {
      name: path.basename(root || projectRootFolder),
      version: '0.0.0',
      packageFormatVersion: 'nuget:0.0.0',
      dependencies: {},
    };

    let targetFramework;
    try {
      if (manifestType === 'dotnet-core') {
        targetFramework = getTargetFrameworkFromProjFile(projectRootFolder);
      } else {
        // .csproj is in the same directory as packages.config or project.json
        targetFramework = getTargetFrameworkFromProjFile(path.resolve(fileContentPath, '../'));
      }
    } catch (error) {
      return Promise.reject(error);
    }

    tree.meta = {
      targetFramework: targetFramework ? targetFramework.original : undefined, //TODO implement for more than one TF
    };

    const parser = PARSERS[manifestType];
    let manifest = parser.fileContentParser.parse(fileContent, tree);

    if (manifestType === 'dotnet-core' && useProjectNameFromAssetsFile) {
      let projectName = _.get(manifest, 'project.restore.projectName');
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
  },
};
