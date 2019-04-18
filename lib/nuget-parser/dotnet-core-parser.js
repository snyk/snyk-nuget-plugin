'use strict';
const Dependency = require('../nuget-parser/dependency');
const debug = require('debug')('snyk');
const _ = require('lodash');

// TODO: any convention for global vars? (gFreqDeps)
let freqDeps = {};

function initFreqDepsDict() {
  freqDeps['Microsoft.NETCore.Platforms'] = false;
  freqDeps['Microsoft.NETCore.Targets'] = false;
  freqDeps['System.Runtime'] = false;
  freqDeps['System.IO'] = false;
  freqDeps['System.Text.Encoding'] = false;
  freqDeps['System.Threading.Tasks'] = false;
  freqDeps['System.Reflection'] = false;
  freqDeps['System.Globalization'] = false;
  freqDeps.dependencies = new Dependency('freqSystemDependencies', 0);
}

function convertFromPathSyntax(path) {
  let name = path.split('/').join('@'); // posix
  name = name.split('\\').join('@'); // windows
  return name;
}

function collectFlatList(targetObj) {
  const names = Object.keys(targetObj);
  return names.map(function (name) {
    name = convertFromPathSyntax(name);
    return name;
  });
}

function buildTreeRecursive(targetDeps, depName, parent, treeDepth) {
  const MAX_TREE_DEPTH = 40;
  if (treeDepth > MAX_TREE_DEPTH) {
    throw new Error('The depth of the tree is too big.');
  }

  let depResolvedName = '';
  let originalDepKey = '';

  debug(`${treeDepth}: Looking for '${depName}'`);
  const depNameLowerCase = depName.toLowerCase();
  const exists = Object.keys(targetDeps).some(function (currentDep) {
    let currentResolvedName = convertFromPathSyntax(currentDep);
    if (currentResolvedName.split('@')[0].toLowerCase() === depNameLowerCase) {
      depResolvedName = currentResolvedName;
      originalDepKey = currentDep;
      debug(`${treeDepth}: Found '${currentDep}'`);
      return true;
    }
  });

  if (!exists) {
    debug(`Failed to find '${depName}'`);
    return;
  }

  const depVersion = depResolvedName.split('@')[1];

  parent.dependencies[depName] =
    parent.dependencies[depName] || new Dependency(depName, depVersion);

  Object.keys(targetDeps[originalDepKey].dependencies || {}).forEach(
    function (currentDep) {
      if (currentDep in freqDeps) {
        if (freqDeps[currentDep]) {
          return;
        }

        buildTreeRecursive(targetDeps,
          currentDep,
          freqDeps.dependencies,
          0);
        freqDeps[currentDep] = true;
      } else {
        buildTreeRecursive(targetDeps,
          currentDep,
          parent.dependencies[depName],
          treeDepth + 1);
      }
    });
}

function getFrameworkToRun(manifest) {
  const frameworks = _.get(manifest, 'project.frameworks');

  debug(`Available frameworks: '${Object.keys(frameworks)}'`);

  // not yet supporting multiple frameworks in the same assets file ->
  // taking only the first 1
  const selectedFrameworkKey = Object.keys(frameworks)[0];
  debug(`Selected framework: '${selectedFrameworkKey}'`);
  return selectedFrameworkKey;
}

function getTargetObjToRun(manifest) {
  debug(`Available targets: '${Object.keys(manifest.targets)}'`);

  let selectedTargetKey = Object.keys(manifest.targets)[0];
  debug(`Selected target: '${selectedTargetKey}'`);
  // not yet supporting multiple targets in the same assets file ->
  // taking only the first 1
  return manifest.targets[selectedTargetKey];
}

function validateManifest(manifest) {
  if (!manifest.project) {
    throw new Error('Project field was not found in project.assets.json');
  }

  if (!manifest.project.frameworks) {
    throw new Error('No frameworks were found in project.assets.json');
  }

  if (_.isEmpty(manifest.project.frameworks)) {
    throw new Error('0 frameworks were found in project.assets.json');
  }

  if (!manifest.targets) {
    throw new Error('No targets were found in project.assets.json');
  }

  if (_.isEmpty(manifest.targets)) {
    throw new Error('0 targets were found in project.assets.json');
  }
}

module.exports = {
  parse: function (tree, manifest) {
    return new Promise(function parseFileContents(resolve, reject) {
      debug('Trying to parse dot-net-cli manifest');

      try {
        validateManifest(manifest);
      } catch (err) {
        debug('Invalid project.assets.json manifest file');
        reject(err);
      }

      if (manifest.project.version) {
        tree.version = manifest.project.version;
      }

      // If a targetFramework was not found in the proj file, we will extract it from the lock file
      if (!tree.meta.targetFramework) {
        tree.meta.targetFramework = getFrameworkToRun(manifest);
      }
      const selectedFrameworkObj = manifest.project.frameworks[tree.meta.targetFramework];

      // We currently ignore the found targetFramework when looking for target dependencies
      const selectedTargetObj = getTargetObjToRun(manifest);

      initFreqDepsDict();

      const directDependencies = collectFlatList(selectedFrameworkObj.dependencies);
      debug(`directDependencies: '${directDependencies}'`);

      directDependencies.forEach(function (directDep) {
        debug(`First order dep: '${directDep}'`);
        buildTreeRecursive(selectedTargetObj, directDep, tree, 0);
      });

      if (!_.isEmpty(freqDeps.dependencies.dependencies)) {
        tree.dependencies['freqSystemDependencies'] = freqDeps.dependencies;
      }
      // to disconnect the object references inside the tree
      // JSON parse/stringify is used
      tree.dependencies = JSON.parse(JSON.stringify(tree.dependencies));
      resolve(tree);
    });
  },
};
