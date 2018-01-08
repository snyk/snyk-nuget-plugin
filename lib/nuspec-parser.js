var zip = require('zip');
var Promise = require('es6-promise');
var fs = require('fs');
var path = require('path');
var safeBufferRead = require('./safe-buffer-read');
var parseXML = require('xml2js').parseString;
var Dependency = require('./dependency');

function parseNuspec(library, sep) {
  var P = new Promise(function (resolve, reject) {
    var pathSep = sep || '.';
    var nuspecPath = path.resolve(
      library.path,
      library.name + pathSep + library.version + '.nupkg');
    var rawZipped;

    try {
      rawZipped = fs.readFileSync(nuspecPath);
    } catch (err) {
      return resolve(null);
    }
    var reader = zip.Reader(rawZipped);
    var nuspecContent = null;
    reader.forEach(function (entry) {
      if (path.extname(entry._header.file_name) === '.nuspec') { // jscs:ignore
        nuspecContent = safeBufferRead(entry.getData());
      }
    });
    parseXML(nuspecContent, function (err, result) {
      if (err) {
        reject(err);
      } else {
        var ownDependencies = [];
        (result.package.metadata || []).forEach(function (metadata) {
          (metadata.dependencies || []).forEach(function (rawDependency) {
            (rawDependency.group || []).forEach(function (group) {
              (group.dependency || []).forEach(function (dep) {
                var transitiveDependency = new Dependency(dep.$.id, dep.$.version); // jscs:ignore
                transitiveDependency.versionSpec = dep.$.versionSpec;
                ownDependencies.push(transitiveDependency);
              });
            });
            (rawDependency.dependency || []).forEach(function (dep) {
              var transitiveDependency =
                new Dependency(dep.$.id, dep.$.version, null);
              transitiveDependency.versionSpec = dep.$.version;
              ownDependencies.push(transitiveDependency);
            });
          });
        });
        resolve({
          name: library.name,
          children: ownDependencies.filter(function (dep) {
            return dep.name.indexOf('System.') !== 0;
          }),
        });
      }
    });
  });
  return P;
}

module.exports = parseNuspec;
