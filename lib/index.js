var fs = require('fs');
var parseXML = require('xml2js').parseString;
var Promise = require('es6-promise').Promise;
var Dependecy = require('./dependency');
var findFolder = require('./find-folder');
var path = require('path');
var parseNuspec = require('./nuspec-parser');

var flattendPackageList = {};
var nuspecResolutions = {};

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
    var projectRootFolder = path.resolve(
      root || '.',
      targetFile || '.',
      '../../');
    var fileContent = fs.readFileSync(targetFile).toString();
    var contentAsJson = isJSON(fileContent);
    var packageTree = {
        package: {
          plugin: {
            name: 'snyk-nuget-plugin',
            targetFile: targetFile,
          },
          name: path.basename(root || projectRootFolder),
          version: '0.0.0',
          packageFormatVersion: 'nuget:0.0.0',
          from: [path.basename(root || projectRootFolder) + '@0.0.0'],
          dependencies: {},
        },
      };
    var tree = packageTree.package;
    var chain = new Promise(function parseFileContents(resolve, reject) {
      // Parse the file content

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
      // collect installed packages and add to flat list
      var installedPackages = [];
      if (rawXML === contentAsJson) {
        // start parsing JSON data
        var rawDependencies = contentAsJson['dependencies'];
        if (rawDependencies) {
          for (var name in rawDependencies) {
            // Array<{ "libraryName": "version" }>
            var version = rawDependencies[name];
            var newDependency = new Dependecy(name, version, null);
            if (newDependency.name.indexOf('System.') !== 0) {
              installedPackages.push(newDependency);
            }
          }
        }
      } else {
        // start parsing XML data
        rawXML.packages.package.forEach(function (node) {
          if (node.$.id.indexOf('System.') !== 0) {
            // include only non-system libraries
            var installedDependency = Dependecy.from.packgesConfigEntry(node);
            installedPackages.push(installedDependency);
          }
        });
      }
      installedPackages.forEach(function (entry) {
        entry.path =
          path.resolve(
            projectRootFolder,
            'packages',
            entry.name + '.' + entry.version);
        flattendPackageList[entry.name] = entry;
      });
    }).then(function () {
      // initiate collecting information from .nuget files on installed packages
      var nuspecParserChain = [];
      for (var name in flattendPackageList) {
        var dep = flattendPackageList[name];
        nuspecParserChain.push(parseNuspec(dep));
      }
      return Promise.all(nuspecParserChain);
    }).then(function (nuspecResolutionChain) {
      nuspecResolutionChain.forEach(function (resolution) {
        if (!resolution) return; // jscs:ignore
        nuspecResolutions[resolution.name] = resolution;
      });
    }).then(function () {
      // .nuget parsing is complete, returned as array of promise resolutions
      // now the flat list should be rebuilt as a tree
      function buildTree(node, requiredChildren, repository) {
        var resolutionName = node.name + '@' + node.version;
        node.from = node.from.concat(resolutionName);
        requiredChildren.forEach(function (requiredChild) {
          var transitiveDependency;
          if (flattendPackageList[requiredChild.name]) {
            // fetch from repo
            transitiveDependency =
              flattendPackageList[requiredChild.name].cloneShallow();
            transitiveDependency.versionSpec =
              requiredChild.versionSpec || transitiveDependency.versionSpec;
          } else {
            // create as new (uninstalled)
            transitiveDependency = new Dependecy(
              requiredChild.name,
              requiredChild.version,
              requiredChild.targetFramework);
            transitiveDependency.versionSpec = requiredChild.version;
          }
          transitiveDependency.from = node.from.concat()
          var transitiveChildren =
            (nuspecResolutions[transitiveDependency.name] &&
             nuspecResolutions[transitiveDependency.name].children) || [];
          buildTree(
            transitiveDependency,
            transitiveChildren,
            repository);
          node.dependencies[transitiveDependency.name] = transitiveDependency;
        });
      }

      var _nugtKeyCount = Object.keys(nuspecResolutions).length;
      tree.dependencies = flattendPackageList
      if (_nugtKeyCount > 0) {
        // local folders scanned, build list from .nuspec
        for (var key in nuspecResolutions) {
          var resolution = nuspecResolutions[key];
          var node = flattendPackageList[resolution.name].cloneShallow();
          node.from = tree.from.concat()
          buildTree(node, resolution.children, flattendPackageList);
          tree.dependencies[node.name] = node;
        }
      }

      return packageTree;
    })['catch'](function (err) {
      throw(err);
    })

    return chain;
  },
};