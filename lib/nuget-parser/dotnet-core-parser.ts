import { InvalidManifestError } from '../errors';
import * as debugModule from 'debug';
import { Dependency } from './dependency';
const debug = debugModule('snyk');

const PACKAGE_DELIMITER = '@';

// TODO: any convention for global vars? (gFreqDeps)
interface FreqDepParent {
  dependencies: any;
  name: 'freqSystemDependencies';
  version: number;
}

interface FreqDeps {
  [dep: string]: boolean | FreqDepParent;
}

interface DepLink {
  from: Dependency;
  to: Dependency;
}
const freqDeps: FreqDeps = {};

function initFreqDepsDict() {
  freqDeps['Microsoft.NETCore.Platforms'] = false;
  freqDeps['Microsoft.NETCore.Targets'] = false;
  freqDeps['System.Runtime'] = false;
  freqDeps['System.IO'] = false;
  freqDeps['System.Text.Encoding'] = false;
  freqDeps['System.Threading.Tasks'] = false;
  freqDeps['System.Reflection'] = false;
  freqDeps['System.Globalization'] = false;
}

function pick(obj: Record<string, unknown>, keys: string[]) {
  const pickedObj: Record<string, unknown> = {};

  Object.keys(obj).forEach(k => {
    if (keys.includes(k)) {
      pickedObj[k] = obj[k];
    }
  });

  return pickedObj;
}

function convertFromPathSyntax(path) {
  let name = path.split('/').join('@'); // posix
  name = name.split('\\').join('@'); // windows
  return name;
}

function collectFlatList(targetObj) {
  const names = Object.keys(targetObj);
  return names.map(name => {
    name = convertFromPathSyntax(name);
    return name;
  });
}

function buildBfsTree(targetDeps, roots) {
  let queue = [...roots];
  const nodes: Dependency[] = [];
  const links: DepLink[] = [];
  while (queue.length > 0) {
    const dep = queue.shift();
    const foundPackage = findPackage(targetDeps, dep);
    if (foundPackage && !isScanned(nodes, foundPackage)) {
      nodes.push(foundPackage);
      if (foundPackage.dependencies) {
        addPackageDepLinks(links, foundPackage);
        queue = queue.concat(Object.keys(foundPackage.dependencies));
      }
    }
  }
  return constructTree(roots, nodes, links);
}

function isScanned(nodes: Dependency[], pkg: Dependency): boolean {
  const node = nodes.find(
    elem => elem.name === pkg.name && elem.version === pkg.version,
  );
  return !!node;
}

function isFreqDep(packageName: string): boolean {
  return packageName in freqDeps;
}

function addPackageDepLinks(links: DepLink[], pkg: Dependency) {
  if (pkg && pkg.dependencies) {
    const from = { name: pkg.name, version: pkg.version };
    for (const name of Object.keys(pkg.dependencies)) {
      const to = { name, version: pkg.dependencies[name] };
      links.push({ from, to });
    }
  }
}

function findPackage(targetDeps, depName: string): Dependency | undefined {
  debug(`Looking for ${depName}`);
  const depNameLowerCase = depName.toLowerCase();
  for (const currentDep of Object.keys(targetDeps)) {
    const currentResolvedName = convertFromPathSyntax(currentDep);
    const [currentDepName, currentDepVersion] = currentResolvedName.split(
      PACKAGE_DELIMITER,
    );
    if (currentDepName.toLowerCase() === depNameLowerCase) {
      return {
        name: depName,
        version: currentDepVersion,
        dependencies: targetDeps[currentDep].dependencies,
      };
    }
  }
  debug(`Failed to find ${depName}`);
  return undefined;
}

function constructTree(roots: string[], nodes: Dependency[], links: DepLink[]) {
  const treeMap = {};
  for (const node of nodes) {
    const { name, version } = node;
    const treeNode = { name, version, dependencies: {} };
    treeMap[name] = treeNode;
  }

  for (const link of links) {
    const parentName = link.from.name;
    const childName = link.to.name;
    const parentNode = treeMap[parentName];
    const childNode = treeMap[childName];
    if (!isFreqDep(childName)) {
      parentNode.dependencies[childName] = {
        ...childNode,
      };
    }
  }

  const tree = pick(treeMap, roots);
  const freqSysDeps = pick(treeMap, Object.keys(freqDeps));
  if (Object.keys(freqSysDeps).length > 0) {
    tree['freqSystemDependencies'] = {
      name: 'freqSystemDependencies',
      version: '0.0.0',
      dependencies: freqSysDeps,
    };
  }
  return tree;
}

function getFrameworkToRun(manifest) {
  const frameworks = manifest?.project?.frameworks;

  debug(`Available frameworks: '${Object.keys(frameworks)}'`);

  // not yet supporting multiple frameworks in the same assets file ->
  // taking only the first 1
  const selectedFrameworkKey = Object.keys(frameworks)[0];
  debug(`Selected framework: '${selectedFrameworkKey}'`);
  return selectedFrameworkKey;
}

function getTargetObjToRun(manifest) {
  debug(`Available targets: '${Object.keys(manifest.targets)}'`);

  const selectedTargetKey = Object.keys(manifest.targets)[0];
  debug(`Selected target: '${selectedTargetKey}'`);
  // not yet supporting multiple targets in the same assets file ->
  // taking only the first 1
  return manifest.targets[selectedTargetKey];
}

function validateManifest(manifest) {
  if (!manifest.project) {
    throw new InvalidManifestError(
      'Project field was not found in project.assets.json',
    );
  }

  if (!manifest.project.frameworks) {
    throw new InvalidManifestError(
      'No frameworks were found in project.assets.json',
    );
  }

  if (
    !manifest.project.frameworks ||
    Object.keys(manifest.project.frameworks).length === 0
  ) {
    throw new InvalidManifestError(
      '0 frameworks were found in project.assets.json',
    );
  }

  if (!manifest.targets) {
    throw new InvalidManifestError(
      'No targets were found in project.assets.json',
    );
  }

  if (!manifest.targets || Object.keys(manifest.targets).length === 0) {
    throw new InvalidManifestError(
      '0 targets were found in project.assets.json',
    );
  }
}

export async function parse(tree, manifest) {
  debug('Trying to parse dot-net-cli manifest');

  validateManifest(manifest);

  if (manifest.project.version) {
    tree.version = manifest.project.version;
  }

  // If a targetFramework was not found in the proj file, we will extract it from the lock file
  // OR
  // If the targetFramework is undefined, extract it from the lock file
  // Fix for https://github.com/snyk/snyk-nuget-plugin/issues/75
  if (
    !tree.meta.targetFramework ||
    manifest.project.frameworks[tree.meta.targetFramework] === undefined
  ) {
    tree.meta.targetFramework = getFrameworkToRun(manifest);
  }
  const selectedFrameworkObj =
    manifest.project.frameworks[tree.meta.targetFramework];

  // We currently ignore the found targetFramework when looking for target dependencies
  const selectedTargetObj = getTargetObjToRun(manifest);

  initFreqDepsDict();

  const directDependencies = selectedFrameworkObj.dependencies
    ? collectFlatList(selectedFrameworkObj.dependencies)
    : [];
  debug(`directDependencies: '${directDependencies}'`);

  tree.dependencies = buildBfsTree(selectedTargetObj, directDependencies);
  // to disconnect the object references inside the tree
  // JSON parse/stringify is used
  tree.dependencies = JSON.parse(JSON.stringify(tree.dependencies));
  return tree;
}
