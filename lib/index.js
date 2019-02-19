var path = require('path');
var dotnetParser = require('./dotnet-parser');
var paketParser = require('snyk-paket-parser');

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
      throw new Error('Could not determine manifest type for ' + filename);
    }
  }
}

module.exports = {
  inspect: function (root, targetFile, options) {
    options = options || {};
    var fileContentPath = path.resolve(root || '.', targetFile || '.');
    var manifestType;
    try {
      manifestType = determineManifestType(path.basename(targetFile || root));
    } catch (error) {
      return Promise.reject(error);
    }

    var createPackageTree = function (depTree) {
      return {
        package: depTree,
        plugin: {
          name: 'snyk-nuget-plugin',
          targetFile: targetFile,
        },
      };
    };

    if (manifestType === 'paket') {
      return paketParser.buildDepTreeFromFiles(
        root,
        targetFile,
        path.join(path.dirname(targetFile), 'paket.lock'),
        options['include-dev'],
        options.strict
      ).then(createPackageTree);
    }

    return dotnetParser.parse(
      root,
      targetFile,
      options.packagesFolder,
      fileContentPath,
      manifestType).then(createPackageTree);

  },
};
