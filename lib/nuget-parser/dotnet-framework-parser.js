'use strict';
const fs = require('fs');
const debug = require('debug')('snyk');
const path = require('path');
const Dependency = require('./dependency');
const parseNuspec = require('./nuspec-parser');

function injectPath(dep, packagesFolder) {
  dep.path = dep.localPath ?
    path.resolve(packagesFolder, dep.localPath)
    : path.resolve(packagesFolder, dep.name + '.' + dep.version);
  if (dep.localPath) {
    delete dep.localPath;
  }
}

function scanInstalled(installedPackages, packagesFolder) {
  const flattenedPackageList = {};
  debug('Located ' + installedPackages.length + ' packages in manifest');
  installedPackages.forEach(function (entry) {
    injectPath(entry, packagesFolder);
    flattenedPackageList[entry.name] =
      flattenedPackageList[entry.name] || entry;
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
        if (flattenedPackageList[dep.name] &&
          flattenedPackageList[dep.name].version !== dep.version) {
          // prefer found from packages folder (dep) over existing
          debug('For package ' + dep.name + ' the version ' +
            flattenedPackageList[dep.name].version +
            ' was extracted from manifest file.' +
            '\nWe are overwriting it with version ' + dep.version +
            ' from the packages folder');
          flattenedPackageList[dep.name] = dep;
        }
      });
  } catch (err) {
    debug('Could not complete packages folder scanning');
    debug(err);
  }
  return flattenedPackageList;
}

function fetchNugetInformationFromPackages(flattenedPackageList, dotnetVersions) {
  const nuspecParserChain = [];
  // begin collecting information from .nuget files on installed packages
  debug('Trying to analyze .nuspec files');
  for (const name in flattenedPackageList) {
    const dep = flattenedPackageList[name];
    debug('...' + name);
    nuspecParserChain.push(parseNuspec(dep, dotnetVersions));
  }
  return Promise.all(nuspecParserChain);
}

function processNugetInformation(nuspecResolutionChain) {
  const nuspecResolutions = {};
  nuspecResolutionChain.forEach(function (resolution) {
    if (!resolution) {
      return;
    } // jscs:ignore
    debug('.nuspec analyzed for ' + resolution.name);
    nuspecResolutions[resolution.name] = resolution;
  });
  return nuspecResolutions;
}

module.exports = {
  parse: function (tree, fileContent, fileContentParser, dotnetVersions, packagesFolder) {
    tree.meta.targetFramework = dotnetVersions[0].original;

    const installedPackages = fileContentParser.parse(fileContent, tree);
    const flattenedPackageList = scanInstalled(installedPackages, packagesFolder);
    return fetchNugetInformationFromPackages(flattenedPackageList, dotnetVersions)
      .then(processNugetInformation)
      .then(function buildDependencyTree(nuspecResolutions) {
        // .nuget parsing is complete, returned as array of promise resolutions
        // now the flat list should be rebuilt as a tree
        debug('Building dependency tree');
        function buildTree(node, requiredChildren, repository) {
          requiredChildren.forEach(function (requiredChild) {
            let transitiveDependency;
            if (flattenedPackageList[requiredChild.name]) {
              // fetch from repo
              transitiveDependency =
                flattenedPackageList[requiredChild.name].cloneShallow();
            } else {
              // create as new (uninstalled)
              transitiveDependency = new Dependency(
                requiredChild.name,
                requiredChild.version);
            }
            const transitiveChildren =
              (nuspecResolutions[transitiveDependency.name] &&
                nuspecResolutions[transitiveDependency.name].children) || [];
            buildTree(
              transitiveDependency,
              transitiveChildren,
              repository);
            node.dependencies[transitiveDependency.name] = transitiveDependency;
          });
        }

        const _nugtKeyCount = Object.keys(nuspecResolutions).length;
        Object.keys(flattenedPackageList).forEach(function (packageName) {
          tree.dependencies[packageName] =
            flattenedPackageList[packageName].cloneShallow();
        });
        if (_nugtKeyCount > 0) {
          // local folders scanned, build list from .nuspec
          for (const key in nuspecResolutions) {
            const resolution = nuspecResolutions[key];
            const node = flattenedPackageList[resolution.name].cloneShallow();
            buildTree(node, resolution.children, flattenedPackageList);
            tree.dependencies[node.name] = node;
          }
        }
        return tree;
      }).catch(function (err) {
        throw (err);
      });
  },
};
