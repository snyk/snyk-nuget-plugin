import * as fs from 'fs';
import * as path from 'path';
import debugModule from 'debug';
import { parseNuspec } from './nuspec-parser';
import { Dependency } from '../types';
import { InvalidFolderFormatError } from '../../errors/invalid-folder-format-error';

const debug = debugModule('snyk');

export function cloneShallow(dep: Dependency): Dependency {
  // clone, without the dependencies
  return {
    dependencies: {},
    name: dep.name,
    version: dep.version,
  };
}

function extractFromDotVersionNotation(expression) {
  const regexParseResult =
    /(?=\S+)(?=\.{1})((\.\d+)+((-?\w+\.?\d*)|(\+?[0-9a-f]{5,40}))?)/.exec(
      expression,
    );

  if (regexParseResult == null) {
    debug(
      `Failed to extract version from the folder: ${expression}. This is not supposed to happen and should be reported - the folders should always be in the form of [FolderName].[semantic version]`,
    );
    throw new InvalidFolderFormatError(
      `Tried to parse package version from a folder name but failed. I received: ${expression}`,
    );
  }

  const versionRef = regexParseResult?.[0];
  const name = expression.split(versionRef)[0];
  return {
    name,
    version: versionRef.slice(1),
  };
}

export function fromFolderName(folderName) {
  debug('Extracting by folder name ' + folderName);
  const info = extractFromDotVersionNotation(folderName);
  return {
    dependencies: {},
    name: info.name,
    version: info.version,
  };
}

function injectPath(dep, packagesFolder) {
  dep.path = dep.localPath
    ? path.resolve(packagesFolder, dep.localPath)
    : path.resolve(packagesFolder, dep.name + '.' + dep.version);
  if (dep.localPath) {
    delete dep.localPath;
  }
}

// NuGet package ids are case-insensitive, so lookups go through a
// lowercase id -> canonical name index over the installed package list.
function buildCanonicalNameIndex(
  flattenedPackageList: Record<string, any>,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const name of Object.keys(flattenedPackageList)) {
    index.set(name.toLowerCase(), name);
  }
  return index;
}

function scanInstalled(installedPackages, packagesFolder) {
  const flattenedPackageList = {};
  const canonicalNames = new Map<string, string>();
  debug('Located ' + installedPackages.length + ' packages in manifest');
  installedPackages.forEach((entry) => {
    injectPath(entry, packagesFolder);
    const existingName = canonicalNames.get(entry.name.toLowerCase());
    if (existingName === undefined) {
      flattenedPackageList[entry.name] = entry;
      canonicalNames.set(entry.name.toLowerCase(), entry.name);
    }
    debug('Entry: ' + entry.name + ' -> ' + entry.path);
  });
  try {
    debug('Scanning local installed folders');
    debug('Trying to read from installed packages folder: ' + packagesFolder);
    fs.readdirSync(packagesFolder)
      .map((folderName) => {
        try {
          return fromFolderName(folderName);
        } catch (error: unknown) {
          debug('Unable to parse dependency from folder');
          debug(error);
          return;
        }
      })
      .forEach((dep) => {
        if (dep) {
          injectPath(dep, packagesFolder);
          const existingName = canonicalNames.get(dep.name.toLowerCase());
          const existing =
            existingName !== undefined
              ? flattenedPackageList[existingName]
              : undefined;
          // only add a package from packages folder if version or casing is different
          if (
            existing &&
            (existing.version !== dep.version || existingName !== dep.name)
          ) {
            // prefer found from packages folder (dep) over existing
            debug(
              'For package ' +
                dep.name +
                ' the version ' +
                existing.version +
                ' was extracted from manifest file.' +
                '\nWe are overwriting it with version ' +
                dep.version +
                ' from the packages folder',
            );
            if (existingName !== dep.name) {
              delete flattenedPackageList[existingName as string];
            }
            flattenedPackageList[dep.name] = dep;
            canonicalNames.set(dep.name.toLowerCase(), dep.name);
          }
        }
      });
  } catch (error: unknown) {
    debug('Could not complete packages folder scanning');
    debug(error);
  }
  return flattenedPackageList;
}

async function fetchNugetInformationFromPackages(
  flattenedPackageList,
  targetFramework,
) {
  const nugetPackageInformation: any[] = [];
  // begin collecting information from .nuget files on installed packages
  debug('Trying to analyze .nuspec files');
  for (const name of Object.keys(flattenedPackageList)) {
    try {
      const dep = flattenedPackageList[name];
      debug('...' + name);
      const resolved = await parseNuspec(dep, targetFramework);
      nugetPackageInformation.push(resolved);
    } catch (e) {
      debug('Failed parsing nuspec file');
      debug(e);
      // log but make sure to rethrow the error
      // why? if we cannot parse nuspec file, we got nothing to do!
      throw e;
    }
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

function buildTree(
  node,
  requiredChildren,
  flattenedPackageList,
  nuspecResolutions,
  canonicalNames: Map<string, string>,
) {
  for (const requiredChild of requiredChildren) {
    let transitiveDependency: Dependency;
    const installedName = canonicalNames.get(requiredChild.name.toLowerCase());
    if (installedName !== undefined) {
      // fetch from repo, keeping the installed package's casing
      transitiveDependency = cloneShallow(flattenedPackageList[installedName]);
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
        nuspecResolutions[transitiveDependency.name].children) ||
      [];
    buildTree(
      transitiveDependency,
      transitiveChildren,
      flattenedPackageList,
      nuspecResolutions,
      canonicalNames,
    );
    node.dependencies[transitiveDependency.name] = transitiveDependency;
  }
}

export async function parse(tree, manifest, targetFramework, packagesFolder) {
  if (!targetFramework) {
    throw new Error('No valid Dotnet target framework found');
  }

  const flattenedPackageList = scanInstalled(manifest, packagesFolder);
  const nugetPackageInformation = await fetchNugetInformationFromPackages(
    flattenedPackageList,
    targetFramework,
  );
  const nuspecResolutions = processNugetInformation(nugetPackageInformation);
  // .nuget parsing is complete, returned as array of promise resolutions
  // now the flat list should be rebuilt as a tree
  debug('Building dependency tree');

  const canonicalNames = buildCanonicalNameIndex(flattenedPackageList);
  const nugetKeys = Object.keys(nuspecResolutions);
  Object.keys(flattenedPackageList).forEach((packageName) => {
    tree.dependencies[packageName] = cloneShallow(
      flattenedPackageList[packageName],
    );
  });
  if (nugetKeys.length > 0) {
    // local folders scanned, build list from .nuspec
    for (const key of nugetKeys) {
      const resolution = nuspecResolutions[key];
      const node = cloneShallow(flattenedPackageList[resolution.name]);
      buildTree(
        node,
        resolution.children,
        flattenedPackageList,
        nuspecResolutions,
        canonicalNames,
      );
      tree.dependencies[node.name] = node;
    }
  }
  return tree;
}
