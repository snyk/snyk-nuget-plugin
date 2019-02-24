const fs = require('fs');
const path = require('path');
const debug = require('debug')('snyk');
const determineDotnetVersions = require('./csproj-parser');

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
  buildDepTreeFromFiles: function (root, targetFile, packagesFolderPath, manifestType) {
    const fileContentPath = path.resolve(root || '.', targetFile || '.');
    let fileContent;
    try {
      fileContent = fs.readFileSync(fileContentPath).toString();
    } catch (error) {
      return Promise.reject(error);
    }
    const projectRootFolder = path.resolve(fileContentPath, '../../');
    const packagesFolder = getPackagesFolder(packagesFolderPath, projectRootFolder);

    let dotnetVersions;
    try {
      if (manifestType === 'dotnet-core') {
        dotnetVersions = determineDotnetVersions(projectRootFolder);
      } else {
        // .csproj is in the same directory as packages.config or project.json
        dotnetVersions = determineDotnetVersions(path.resolve(fileContentPath, '../'));
      }
    } catch (error) {
      return Promise.reject(error);
    }

    debug('Loaded ' + targetFile + ' with manifest type ' + manifestType);

    const tree = {
      name: path.basename(root || projectRootFolder),
      version: '0.0.0',
      packageFormatVersion: 'nuget:0.0.0',
      dependencies: {},
      meta: {
        targetFramework: dotnetVersions[0].original, //TODO implement for more than one TF
      },
    };

    const parser = PARSERS[manifestType];
    return parser.depParser.parse(tree,
      fileContent,
      parser.fileContentParser,
      dotnetVersions,
      packagesFolder);
  },
};
