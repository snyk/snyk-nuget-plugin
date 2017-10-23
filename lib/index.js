var fs = require('fs');
var parseXML = require('xml2js').parseString;
var Promise = require('es6-promise').Promise;
var Dependecy = require('./dependency');
var findFolder = require('./find-folder');
var path = require('path');
var parseNuspec = require('./nuspec-parser');

var dependencyTree = {};

function isJSON(content) {
  try {
    return JSON.parse(content);
  } catch (err) {
    return false;
  }
}

// TODO: attempt to retreive the root package name, version

module.exports = {
  inspect: function (root, targetFile, options) {
    var projectRootFolder = path.resolve(targetFile, '../../');
    var fileContent = fs.readFileSync(targetFile).toString();
    var contentAsJson = isJSON(fileContent);
    var tree = {
      plugin: {
        name: 'NuGet',
        targetFile: targetFile,
      },
      package: {
        name: projectRootFolder,
        version: null,
        packageFormatVersion: 'Nuget:0.0.0',
        dependencies: {},
      },
      from: null,
    };
    var chain = new Promise(function (resolve, reject) {
      if (contentAsJson) {
        // skip parsing from XML
        return resolve(contentAsJson);
      }
      // not a JSON, try XML
      parseXML(fileContent, function (err, result) {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      })
    }).then(function (rawXML) {
      var list = [];
      if (rawXML === contentAsJson) {
        var rawDependencies = contentAsJson['dependencies'];
        if (rawDependencies) {
          for (var name in rawDependencies) {
            var version = rawDependencies[name];
            var newDependency = new Dependecy(name, version, null);
            if (newDependency.resolvedName.indexOf('System.') !== 0) {
              list.push(newDependency);
            }
          }
        }
      } else {
        rawXML.packages.package.forEach(function (node) {
          var newDependency =
            new Dependecy(node.$.id, node.$.version, node.$.targetFramework);
          newDependency.path =
            path.resolve(
              projectRootFolder,
              'packages',
              newDependency.resolvedName);
          if (newDependency.resolvedName.indexOf('System.') !== 0) {
            list.push(newDependency);
          }
        });
      }
      list.forEach(function (entry) {
        entry.path = path.resolve(
          projectRootFolder,
          'packages',
          entry.resolvedName);
        dependencyTree[entry.resolvedName] = entry;
      });
    }).then(function () {
      var nuspecParserChain = [];
      for (var resolvedName in dependencyTree) {
        var dep = dependencyTree[resolvedName];
        nuspecParserChain.push(parseNuspec(dep));
      }
      return Promise.all(nuspecParserChain);
    }).then(function (nuspecResolutionChain) {
      nuspecResolutionChain.forEach(function (resolution) {
        if (!resolution) return; // jscs:ignore
        var node = dependencyTree[resolution.parent];
        resolution.children.forEach(function (childNode) {
          var dependency =
            dependencyTree[childNode.resolvedName] ||
            new Dependecy(
              childNode.name,
              childNode.version,
              childNode.targetFramework);
          node.dependencies[dependency.resolvedName] = dependency;
        });
      });
      for (var packageName in dependencyTree) {
        if (packageName.indexOf('System.') !== 0) {
          tree.package.dependencies[packageName] = dependencyTree[packageName];
        }
      }
      return tree;
    })['catch'](function (err) {
      throw(err);
    })

    return chain;
  },
};