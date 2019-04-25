'use strict';
const path = require('path');
const nugetParser = require('./nuget-parser');
const paketParser = require('snyk-paket-parser');

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
    let manifestType;
    try {
      manifestType = determineManifestType(path.basename(targetFile || root));
    } catch (error) {
      return Promise.reject(error);
    }

    const createPackageTree = function (depTree) {
      const targetFramework = depTree.meta ? depTree.meta.targetFramework : undefined; // TODO implement for paket and more than one framework
      delete depTree.meta;
      return {
        package: depTree,
        plugin: {
          name: 'snyk-nuget-plugin',
          targetFile: targetFile,
          targetRuntime: targetFramework,
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

    return nugetParser.buildDepTreeFromFiles(
      root,
      targetFile,
      options.packagesFolder,
      manifestType,
      options['assets-project-name']).then(createPackageTree);
  },
};
