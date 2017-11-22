var fs = require('fs');
var parseXML = require('xml2js').parseString;
var Promise = require('es6-promise').Promise;
var Dependecy = require('./dependency');
var findFolder = require('./find-folder');
var path = require('path');
var parseNuspec = require('./nuspec-parser');
var jsonManifestParest = require('./json-manifest-parser');
var debug = require('debug')('snyk');

function determineManifestType (filename) {
  switch (true) {
    case /.json$/.test(filename): {
      return 'project.json';
    }
    case /packages.config$/.test(filename): {
      return 'packages.config';
    }
    case /.csproj$/.test(filename): {
      return '.csproj'
    }
    default: {
      throw new Error('Could not determine manifest type for ' + filename);
    }
  }
}

module.exports = {
  inspect: function (root, targetFile, options) {
    var packagesFolder;
    var flattendPackageList = {};
    var nuspecResolutions = {};
    var manifestType;
    var fileContent;
    var projectRootFolder = path.resolve(
      root || '.',
      targetFile || '.',
      '../../');
    if (options && options.packagesFolder) {
      packagesFolder = path.resolve(process.cwd(), options.packagesFolder);
    } else {
      packagesFolder = path.resolve(projectRootFolder, 'packages');
    }
    try {
      manifestType = determineManifestType(path.basename(targetFile || root));
      fileContent = fs.readFileSync(targetFile).toString();
      debug('Loaded ' + targetFile + ' with manifest type ' + manifestType);
    }
    catch (error) {
      return Promise.reject(error);
    }
    var packageTree = {
        package: {
          name: path.basename(root || projectRootFolder),
          version: '0.0.0',
          packageFormatVersion: 'nuget:0.0.0',
          from: [path.basename(root || projectRootFolder) + '@0.0.0'],
          dependencies: {},
        },
        plugin: {
          name: 'snyk-nuget-plugin',
          targetFile: targetFile,
        },
      };
    var tree = packageTree.package;

    var chain = new Promise(function parseFileContents(resolve, reject) {
      var installedPackages = [];
      switch (manifestType) {
        case 'project.json': {
          debug('Trying to parse project.json format manifest');
          var projectData = jsonManifestParest.parse(fileContent);
          var rawDependencies = projectData.dependencies;
          debug(rawDependencies);
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
          if (projectData.project) {
            packageTree.package.name = projectData.project.name;
            packageTree.package.version = projectData.project.version;
          }
          resolve(installedPackages);
          break;
        }
        case 'packages.config': {
          debug('Trying to parse packages.config manifest');
          parseXML(fileContent, function scanPackagesConfig(err, result) {
            if (err) {
              reject(err);
            } else {
              result.packages.package.forEach(
                function scanPackagesConfigNode(node) {
                  if (node.$.id.indexOf('System.') !== 0) {
                    // include only non-system libraries
                    var installedDependency =
                      Dependecy.from.packgesConfigEntry(node);
                    installedPackages.push(installedDependency);
                  }
                });
              resolve(installedPackages);
            }
          })
          break;
        }
        case '.csproj': {
          debug('Trying to parse .csproj manifest');
          parseXML(fileContent, function scanCsprojContent(err, result) {
            if (err) {
              reject(err);
            } else {
              (result.Project.ItemGroup || []).forEach(function (itemGroup) {
                (itemGroup.Reference || []).forEach(function (referenceItem) {
                  if (referenceItem.HintPath) {
                    try {
                      var installedDependency =
                        Dependecy.from.csprojEntry(referenceItem);
                      if (installedDependency.name.indexOf('System.') !== 0) {
                        installedPackages.push(installedDependency);
                      }
                    }
                    catch (err) {
                      debug('Could not parse package name. Skipping');
                      // gracefully continue
                    }
                  }
                });
              });
            }
            resolve(installedPackages);
          });
          break;
        }
      }
    }).then(function scanInstalled(installedPackages) {
      debug('Located ' + installedPackages.length + ' packages in manifest');
      function injectPath(dep) {
        dep.path = path.resolve(
          packagesFolder,
          dep.name + '.' + dep.version
        );
      }
      installedPackages.forEach(function (entry) {
        injectPath(entry);
        flattendPackageList[entry.name] = entry;
        debug('Entry: ' + entry.name + ' -> ' + entry.path);
      });
      try {
        debug('Trying to read installed packaged folder: ' + packagesFolder);
        fs.readdirSync(packagesFolder)
        .filter(function (name) {
          return name.slice(0, 7).toLowerCase() !== 'system.'
        })
        .map(function (folderName) {
          return Dependecy.from.folderName(folderName);
        })
        .forEach(function (dep) {
          injectPath(dep);
          flattendPackageList[dep.name] = flattendPackageList[dep.name] || dep;
        });
      } catch (error) {
        debug('Could not complete installed packages folder scanning');
        debug(error);
        // could not read installed packages folder,
        // continue only with manifest list
      }
      var sorted = {}
      Object.keys(flattendPackageList).sort().forEach(function (key) {
        sorted[key] = flattendPackageList[key];
      });
      flattendPackageList = sorted;
    }).then(function fetchNugetInformationFromPackages() {
      // initiate collecting information from .nuget files on installed packages
      debug('Trying to analyze .nuspec files');
      var nuspecParserChain = [];
      for (var name in flattendPackageList) {
        var dep = flattendPackageList[name];
        debug('...' + name);
        nuspecParserChain.push(parseNuspec(dep));
      }
      return Promise.all(nuspecParserChain);
    }).then(function processNugetInformation(nuspecResolutionChain) {
      nuspecResolutionChain.forEach(function (resolution) {
        if (!resolution) return; // jscs:ignore
        debug('.nuspec analyzed for ' + resolution.name);
        nuspecResolutions[resolution.name] = resolution;
      });
    }).then(function buildDependencyTree() {
      // .nuget parsing is complete, returned as array of promise resolutions
      // now the flat list should be rebuilt as a tree
      debug('Building dependency tree');
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
              requiredChild.version);
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
      Object.keys(flattendPackageList).forEach(function (packageName) {
        tree.dependencies[packageName] =
          flattendPackageList[packageName].cloneShallow()
      })
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