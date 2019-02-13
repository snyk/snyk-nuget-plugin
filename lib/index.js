var fs = require('fs');
var path = require('path');
var debug = require('debug')('snyk');
const dotnetParser = require('./dotnet-parser');

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
    var fileContentPath = path.resolve(root || '.', targetFile || '.');
    var manifestType;
    try {
      manifestType = determineManifestType(path.basename(targetFile || root));
    } catch (error) {
      return Promise.reject(error);
    }
    var fileContent;
    try {
      fileContent = fs.readFileSync(fileContentPath).toString();
    } catch (error) {
      return Promise.reject(error);
    }

    return dotnetParser.parse(root, options, targetFile, fileContentPath, fileContent, manifestType);

  },
};

