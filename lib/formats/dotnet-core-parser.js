var Dependency = require('../dependency');
var debug = require('debug')('snyk');

function convertFromPathSyntax(path) {
  var name = path.split('/').join('@'); // posix
  name = name.split('\\').join('@'); // windows
  return name;
}

function collectFlatList(targetObj) {
  var names = Object.keys(targetObj);
  var libs = names.map(function (name) {
    name = convertFromPathSyntax(name);
    return name;
  });
  return libs;
}

function registerDependency(packageTree, resolvedName) {
  var name = resolvedName.split('@')[0];
  var version = resolvedName.split('@')[1];
  packageTree.dependencies[name] =
    packageTree.dependencies[name] || new Dependency(name, version);
  debug(resolvedName);
}

function parse(fileContent, packageTree) {
  var libraries = {};
  var manifest = JSON.parse(fileContent);
  if (manifest.project) {
    packageTree.version = manifest.project.version;
  }
  var targets = Object
    .keys(manifest.targets)
    .map(function (key) {
      return manifest.targets[key];
    });

  collectFlatList(manifest.libraries).forEach(function (rawName) {
    registerDependency(packageTree, rawName);
  });

  targets.forEach(function (targetObj) {
    collectFlatList(targetObj).forEach(function (rawName) {
      registerDependency(packageTree, rawName);
    });

    Object.keys(targetObj).forEach(function (key) {
      var resolvedName = convertFromPathSyntax(key);
      var depName = resolvedName.split('@')[0];
      var dependency = packageTree.dependencies[depName];
      var depManifest = targetObj[key];
      Object.keys(depManifest.dependencies || {}).forEach(function (key) {
        try {
          var version = depManifest.dependencies[key];
          var lookup = key + '@' + version;
          if (lookup.toLowerCase().indexOf('system.') === 0) {
            // skip system packages in tree
            return;
          }
          // a sub-dependency should never take priority over a regular one
          // even within the subtree
          if (packageTree.dependencies[key]) {
            dependency.dependencies[key] =
              new Dependency(key, packageTree.dependencies[key].version);
          } else {
            dependency.dependencies[key] = new Dependency(key, version);
          }
        }
        catch (err) {
          console.log(err);
        }
      })
    })
  });

  // to disconnect the object references inside the tree
  // JSON parse/stringify is used
  var pathedTree = JSON.parse(JSON.stringify(packageTree.dependencies));
  packageTree.dependencies = pathedTree;
}

module.exports = parse;