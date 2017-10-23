var zip = require('zip');
var Promise = require('es6-promise');
var fs = require('fs');
var path = require('path');
var safeBufferRead = require('./safe-buffer-read');
var parseXML = require('xml2js').parseString;
var Dependency = require('./dependency');

function parseNuspec(dependency) {
  var P = new Promise(function (resolve, reject) {
    var nuspecPath = path.resolve(
      dependency.path,
      dependency.resolvedName + '.nupkg');
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
        var dependencies = [];
        (result.package.metadata || []).forEach(function (metadata) {
          (metadata.dependencies || []).forEach(function (rawDependency) {
            (rawDependency.group || []).forEach(function (group) {
              (group.dependency || []).forEach(function (dep) {
                dependencies.push(
                  new Dependency(dep.$.id, dep.$.version, group.$.targetFramework) // jscs:ignore
                );
              })
            });
            (rawDependency.dependency || []).forEach(function (dep) {
              dependencies.push(new Dependency(dep.$.id, dep.$.version, null));
            });
          })
        });
        resolve({
          parent: dependency.resolvedName,
          children: dependencies.filter(function (dep) {
            return dep.name.indexOf('System.') !== 0;
          }),
        });
      }
    });
  });
  return P;
}

module.exports = parseNuspec;
