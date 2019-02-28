'use strict';
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const parseXML = require('xml2js').parseString;
const Dependency = require('./dependency');
const _ = require('lodash');
const debug = require('debug')('snyk');

const targetFrameworkRegex = /([.a-zA-Z]+)([.0-9]+)/;

function parseNuspec(dep, targetFramework, sep) {
  return Promise.resolve()
    .then(function () {
      const pathSep = sep || '.';
      const nupkgPath =
        path.resolve(dep.path, dep.name + pathSep + dep.version + '.nupkg');
      const nupkgData = fs.readFileSync(nupkgPath);
      return JSZip.loadAsync(nupkgData);
    })
    .then(function (nuspecZipData) {
      const nuspecFile = Object.keys(nuspecZipData.files).find(function (file) {
        return (path.extname(file) === '.nuspec');
      });
      return nuspecZipData.files[nuspecFile].async('string');
    })
    .then(function (nuspecContent) {
      return new Promise(function (resolve, reject) {
        parseXML(nuspecContent, function (err, result) {
          if (err) {
            return reject(err);
          }

          let ownDeps = [];
          // We are only going to check the first targetFramework we encounter
          // in the future we may want to support multiple, but only once
          // we have dependency version conflict resolution implemented
          // _(targetFrameworks).forEach(function (targetFramework) {
          _(result.package.metadata).forEach(function (metadata) {
            _(metadata.dependencies).forEach(function (rawDependency) {

              // Find and add target framework version specific dependencies
              const depsForTargetFramework =
              extractDepsForTargetFramework(rawDependency, targetFramework);

              if (depsForTargetFramework && depsForTargetFramework.group) {
                ownDeps = _.concat(ownDeps,
                  extractDepsFromRaw(depsForTargetFramework.group.dependency));
              }

              // Find all groups with no targetFramework attribute
              // add their deps
              const depsFromPlainGroups =
                extractDepsForPlainGroups(rawDependency);

              if (depsFromPlainGroups) {
                depsFromPlainGroups.forEach(function (depGroup) {
                  ownDeps = _.concat(ownDeps,
                    extractDepsFromRaw(depGroup.dependency));
                });
              }

              // Add the default dependencies
              ownDeps =
              _.concat(ownDeps, extractDepsFromRaw(rawDependency.dependency));
            });
          });

          return resolve({
            name: dep.name,
            children: ownDeps,
          });
        });
      });
    })
    .catch(function (err) {
      // parsing problems are coerced into an empty nuspec
      debug('Error parsing dependency', JSON.stringify(dep), err);
      return null;
    });
}

function extractDepsForPlainGroups(rawDependency) {
  return _(rawDependency.group)
    .filter(function (group) {
      // valid group with no attributes or no `targetFramework` attribute
      return group && !(group.$ && group.$.targetFramework);
    });
}

function extractDepsForTargetFramework(rawDependency, targetFramework) {
  return rawDependency && _(rawDependency.group)
    .filter(function (group) {
      return group && group.$ && group.$.targetFramework &&
        targetFrameworkRegex.test(group.$.targetFramework);
    })
    .map(function (group) {
      const parts = _.split(group.$.targetFramework, targetFrameworkRegex);
      return {
        framework: parts[1],
        version: parts[2],
        group: group,
      };
    })
    .orderBy(['framework', 'version'], ['asc', 'desc'])
    .find(function (group) {
      return targetFramework.framework === group.framework &&
        targetFramework.version >= group.version;
    });
}

function extractDepsFromRaw(rawDependencies) {
  const deps = [];
  _.forEach(rawDependencies, function (dependency) {
    if (dependency && dependency.$) {
      const dep = new Dependency(dependency.$.id, dependency.$.version);
      deps.push(dep);
    }
  });
  return deps;
}

module.exports = parseNuspec;
