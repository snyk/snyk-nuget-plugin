import * as fs from 'fs';
import * as path from 'path';
import {Dependency, cloneShallow, fromFolderName} from './dependency';
import {parseNuspec} from './nuspec-parser';
import * as debugModule from 'debug';
const debug = debugModule('snyk');

function injectPath(dep, packagesFolder) {
  dep.path = dep.localPath ?
    path.resolve(packagesFolder, dep.localPath)
    : path.resolve(packagesFolder, dep.name + '.' + dep.version);
  if (dep.localPath) {
    delete dep.localPath;
  }
}

interface PackageList {
  [name: string]: Dependency;
}

function scanInstalled(installedPackages, packagesFolder) {
  const flattenedPackageList: PackageList = {};
  debug(`Located ${installedPackages.length} packages in manifest`);
  for (const entry of installedPackages) {
    injectPath(entry, packagesFolder);
    flattenedPackageList[entry.name] =
      flattenedPackageList[entry.name] || entry;
    debug(`Entry: ${entry.name} -> ${entry.path}`);
  }
  try {
    debug('Scanning local installed folders');
    debug(`Trying to read from installed packages folder: ${packagesFolder}`);
    for (const folderName of fs.readdirSync(packagesFolder)) {
      try {
        const dep = fromFolderName(folderName);

        injectPath(dep, packagesFolder);

        // In case installedPackages is empty, we need to populate the flattenedPackageList with found
        if (installedPackages.length === 0) {
          debug(`${dep.name}@${dep.version} is in packages folder, but not in manifest. Adding to found packages`);
          flattenedPackageList[dep.name] = dep;
        }

        // only add a package from packages folder if version is different
        if (flattenedPackageList[dep.name] &&
          flattenedPackageList[dep.name].version !== dep.version) {
          // prefer found from packages folder (dep) over existing
          debug(`Overwriting ${dep.name} version ${flattenedPackageList[dep.name].version} to ${dep.version} extracted from packages folder.`);
          flattenedPackageList[dep.name] = dep;
        }
      } catch (err) {
        debug('Unable to parse dependency from folder');
        debug(err);
      }
    }
  } catch (err) {
    debug('Could not complete packages folder scanning');
    debug(err);
  }

  return flattenedPackageList;
}

async function fetchNugetInformationFromPackages(flattenedPackageList, targetFramework) {
  const nugetPackageInformation: any[] = [];
  // begin collecting information from .nuget files on installed packages
  debug('Trying to analyze .nuspec files');
  for (const name of Object.keys(flattenedPackageList)) {
    const dep = flattenedPackageList[name];
    debug('...' + name);
    nugetPackageInformation.push(await parseNuspec(dep, targetFramework));
  }
  return nugetPackageInformation;
}

function processNugetInformation(nuspecResolutionChain) {
  const nuspecResolutions = {};
  nuspecResolutionChain.forEach((resolution) => {
    if (!resolution) {
      return;
    } // jscs:ignore
    debug('.nuspec analyzed for ' + resolution.name);
    nuspecResolutions[resolution.name] = resolution;
  });
  return nuspecResolutions;
}

function buildTree(node, requiredChildren, flattenedPackageList, nuspecResolutions) {
  for (const requiredChild of requiredChildren) {
    let transitiveDependency: Dependency;
    if (flattenedPackageList[requiredChild.name]) {
      // fetch from repo
      transitiveDependency = cloneShallow(flattenedPackageList[requiredChild.name]);
    } else {
      // create as new (uninstalled)
      transitiveDependency = {
        dependencies: {},
        name: requiredChild.name,
        version: requiredChild.version,
      };
    }
    const transitiveChildren =
      (nuspecResolutions[transitiveDependency.name] &&
        nuspecResolutions[transitiveDependency.name].children) || [];
    buildTree(
      transitiveDependency,
      transitiveChildren,
      flattenedPackageList,
      nuspecResolutions);
    node.dependencies[transitiveDependency.name] = transitiveDependency;
  }
}


export async function parse(tree, manifest, targetFramework, packagesFolder) {
  if (!targetFramework) {
    throw new Error('No valid Dotnet target framework found');
  }

  const flattenedPackageList = scanInstalled(manifest, packagesFolder);
  const nugetPackageInformation = await fetchNugetInformationFromPackages(flattenedPackageList, targetFramework);
  const nuspecResolutions = processNugetInformation(nugetPackageInformation);
  // .nuget parsing is complete, returned as array of promise resolutions
  // now the flat list should be rebuilt as a tree
  debug('Building dependency tree');

  const nugetKeys = Object.keys(nuspecResolutions);
  for (const packageName of Object.keys(flattenedPackageList)) {
    tree.dependencies[packageName] =
      cloneShallow(flattenedPackageList[packageName]);
  }
  if (nugetKeys.length > 0) {
    // local folders scanned, build list from .nuspec
    for (const key of nugetKeys) {
      const resolution = nuspecResolutions[key];
      const node = cloneShallow(flattenedPackageList[resolution.name]);
      buildTree(node, resolution.children, flattenedPackageList, nuspecResolutions);
      tree.dependencies[node.name] = node;
    }
  }
  return tree;
}
