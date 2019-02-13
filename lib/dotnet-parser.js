var fs = require('fs');
var parseXML = require('xml2js').parseString;
var Dependency = require('./dependency');
var path = require('path');
var parseNuspec = require('./nuspec-parser');
var jsonManifestParser = require('./json-manifest-parser');
var debug = require('debug')('snyk');
var projectJsonFormatParser = require('./formats/dotnet-core-parser');
var determineDotnetVersions = require('./proj-parser');

function injectProjectData(tree, projectData) {
  tree.name = projectData.project.name;
  tree.version = projectData.project.version;
}

function injectPath(dep, packagesFolder) {
  dep.path =
    dep.localPath ?
      path.resolve(packagesFolder, dep.localPath)
      : path.resolve(packagesFolder, dep.name + '.' + dep.version);
  if (dep.localPath) {
    delete dep.localPath;
  }
}

function getPackagesFolder(packagesFolder, projectRootFolder) {
  if (packagesFolder) {
    return path.resolve(process.cwd(), packagesFolder);
  }
  return path.resolve(projectRootFolder, 'packages');
}

module.exports = {
  parse: function (root, targetFile, packagesFolder, fileContentPath, manifestType) {
    var fileContent;
    try {
      fileContent = fs.readFileSync(fileContentPath).toString();
    } catch (error) {
      return Promise.reject(error);
    }
    var projectRootFolder = path.resolve(fileContentPath, '../../');
    var packagesFolder = getPackagesFolder(packagesFolder, projectRootFolder);
    var dotnetVersions;

    try {
      if (manifestType === 'dotnet-core') {
        dotnetVersions = determineDotnetVersions(projectRootFolder);
      } else {
        // .csproj is in the same directory as packages.config or project.json
        dotnetVersions = determineDotnetVersions(path.resolve(fileContentPath, '../'));
      }
    } catch (error) {
      return Promise.reject(error);
    }

    debug('Loaded ' + targetFile + ' with manifest type '
      + manifestType + ' for .NET version ' + dotnetVersions);

    var flattendPackageList = {};
    var nuspecResolutions = {};

    var tree = {
      name: path.basename(root || projectRootFolder),
      version: '0.0.0',
      packageFormatVersion: 'nuget:0.0.0',
      dependencies: {},
    };

    return new Promise(function parseFileContents(resolve, reject) {
      var installedPackages = [];
      switch (manifestType) {
        case 'dotnet-core': {
          debug('Trying to parse dot-net-cli manifest');
          projectJsonFormatParser(fileContent, tree);
          resolve([]); // skip installed dependencies parsing
          break;
        }
        case 'project.json': {
          debug('Trying to parse project.json format manifest');
          var projectData = jsonManifestParser.parse(fileContent);
          var rawDependencies = projectData.dependencies;
          debug(rawDependencies);
          if (rawDependencies) {
            for (var name in rawDependencies) {
              // Array<{ "libraryName": "version" }>
              var version = rawDependencies[name];
              var newDependency = new Dependency(name, version, null);
              installedPackages.push(newDependency);
            }
          }
          if (projectData.project) {
            injectProjectData(tree, projectData);
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
                  var installedDependency =
                    Dependency.from.packgesConfigEntry(node);
                  installedPackages.push(installedDependency);
                });
              resolve(installedPackages);
            }
          });
          break;
        }
      }
    }).then(function scanInstalled(installedPackages) {
      if (manifestType !== 'dotnet-core') {
        debug('Located ' + installedPackages.length + ' packages in manifest');
        installedPackages.forEach(function (entry) {
          injectPath(entry, packagesFolder);
          flattendPackageList[entry.name] =
            flattendPackageList[entry.name] || entry;
          debug('Entry: ' + entry.name + ' -> ' + entry.path);
        });
        try {
          debug('Scanning local installed folders');
          debug('Trying to read from installed packages folder: ' +
            packagesFolder);
          fs.readdirSync(packagesFolder)
            .map(function (folderName) {
              return Dependency.from.folderName(folderName);
            })
            .forEach(function (dep) {
              injectPath(dep, packagesFolder);
              // only add a package from packages folder if version is different
              if (flattendPackageList[dep.name] &&
                flattendPackageList[dep.name].version !== dep.version) {
                // prefer found from packages folder (dep) over existing
                debug('For package ' + dep.name + ' the version ' +
                  flattendPackageList[dep.name].version +
                  ' was extracted from manifest file.' +
                  '\nWe are overwriting it with version ' + dep.version +
                  ' from the packages folder');
                flattendPackageList[dep.name] = dep;
              }
            });
        } catch (err) {
          debug('Could not complete packages folder scanning');
          debug(err);
        }
      } else {
        debug('Located ' +
          Object.keys(tree.dependencies).length + 'packages in manifest');
        var sorted = {};
        Object.keys(flattendPackageList).sort().forEach(function (key) {
          sorted[key] = flattendPackageList[key];
        });
        flattendPackageList = sorted;
      }
    }).then(function fetchNugetInformationFromPackages() {
      var nuspecParserChain = [];
      if (manifestType !== 'dotnet-core') {
        // begin collecting information from .nuget files on installed packages
        debug('Trying to analyze .nuspec files');
        for (var name in flattendPackageList) {
          var dep = flattendPackageList[name];
          debug('...' + name);
          nuspecParserChain.push(parseNuspec(dep, dotnetVersions));
        }
      }
      return Promise.all(nuspecParserChain);
    }).then(function processNugetInformation(nuspecResolutionChain) {
      if (manifestType !== 'dotnet-core') {
        nuspecResolutionChain.forEach(function (resolution) {
          if (!resolution) {
            return;
          } // jscs:ignore
          debug('.nuspec analyzed for ' + resolution.name);
          nuspecResolutions[resolution.name] = resolution;
        });
      }
    }).then(function buildDependencyTree() {
      // .nuget parsing is complete, returned as array of promise resolutions
      // now the flat list should be rebuilt as a tree
      debug('Building dependency tree');
      function buildTree(node, requiredChildren, repository) {
        requiredChildren.forEach(function (requiredChild) {
          var transitiveDependency;
          if (flattendPackageList[requiredChild.name]) {
            // fetch from repo
            transitiveDependency =
              flattendPackageList[requiredChild.name].cloneShallow();
          } else {
            // create as new (uninstalled)
            transitiveDependency = new Dependency(
              requiredChild.name,
              requiredChild.version);
          }
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
          flattendPackageList[packageName].cloneShallow();
      });
      if (_nugtKeyCount > 0) {
        // local folders scanned, build list from .nuspec
        for (var key in nuspecResolutions) {
          var resolution = nuspecResolutions[key];
          var node = flattendPackageList[resolution.name].cloneShallow();
          buildTree(node, resolution.children, flattendPackageList);
          tree.dependencies[node.name] = node;
        }
      }
      return tree;
    })['catch'](function (err) {
      throw (err);
    });
  },
};
