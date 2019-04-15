'use strict';
const parseXML = require('xml2js').parseString;
const debug = require('debug')('snyk');
const Dependency = require('./dependency');

function parsePackagesConfigFileContents(fileContent) {
  const installedPackages = [];
  debug('Trying to parse packages.config manifest');
  parseXML(fileContent, function (err, result) {
    if (err) {
      throw err;
    } else {
      const packages = result.packages.package || [];

      packages.forEach(
        function scanPackagesConfigNode(node) {
          const installedDependency =
            Dependency.from.packgesConfigEntry(node);
          installedPackages.push(installedDependency);
        });
    }
  });
  return installedPackages;
}

module.exports = {
  parse: parsePackagesConfigFileContents,
};
