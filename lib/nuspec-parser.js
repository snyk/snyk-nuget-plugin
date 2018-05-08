var zip = require('zip');
var Promise = require('es6-promise');
var fs = require('fs');
var path = require('path');
var safeBufferRead = require('./safe-buffer-read');
var parseXML = require('xml2js').parseString;
var Dependency = require('./dependency');
var _ = require('lodash');

const targetFrameworkRegex = /([.a-zA-Z]+)([.0-9]+)/;

function parseNuspec(dep, targetFrameworks, sep) {
  var P = new Promise(function (resolve, reject) {
    var pathSep = sep || '.';
    var nuspecPath = path.resolve(
      dep.path,
      dep.name + pathSep + dep.version + '.nupkg');
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
        var ownDeps = [];
        // We are only going to check the first targetFramework we encounter
        // in the future we may want to support multiple, but only once
        // we have dependency version conflict resolution implemented
        // _(targetFrameworks).forEach(function (targetFramework) {
        _(result.package.metadata).forEach(function (metadata) {
          _(metadata.dependencies).forEach(function (rawDependency) {

            // Find and add target framework version specific dependencies
            const depsForTargetFramework = _(rawDependency.group)
              .filter(function (group) {
              return targetFrameworkRegex.test(group.$.targetFramework);
            }).map(function (group) {
              const parts = _.split(group.$.targetFramework, targetFrameworkRegex); // jscs:ignore
              return {
                framework: parts [1],
                version: parts[2],
                group: group,
              }
            }).orderBy(['framework', 'version'], ['asc', 'desc'])
              .find(function (group) {
                return targetFrameworks[0].framework === group.framework &&
                  targetFrameworks[0].version >= group.version;
            });// jscs:ignore validateIndentation

            if (depsForTargetFramework) {
              ownDeps = _.concat(ownDeps,
                extractDepsFromRaw(depsForTargetFramework.group.dependency));
            }

            // Add the default dependencies
            ownDeps = _.concat(ownDeps, extractDepsFromRaw(rawDependency.dependency)); // jscs:ignore
          });
        });
        resolve({
          name: dep.name,
          children: ownDeps,
        });
      }
    });
  });
  return P;
}

function extractDepsFromRaw(rawDependencies) {
  var deps = [];
  _.forEach(rawDependencies, function (dependency) {
    var dep = new Dependency(dependency.$.id, dependency.$.version);
    deps.push(dep);
  });
  return deps;
}

module.exports = parseNuspec;
