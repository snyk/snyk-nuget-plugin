'use strict';
const debug = require('debug')('snyk');
const Dependency = require('./dependency');

function scanForDependencies(obj, deps) {
  deps = deps || {};
  if (typeof obj !== 'object') {
    return deps;
  }
  Object.keys(obj).forEach(function (key) {
    if (key === 'dependencies') {
      const dependencies = obj.dependencies;
      Object.keys(dependencies).forEach(function (key) {
        const depName = key;
        let version = dependencies[key];
        if (typeof version === 'object') {
          version = version.version;
        }
        if (typeof version === 'undefined') {
          version = 'unknown';
        } else {
          version = version.toString();
        }
        deps[depName] = version;
      });
    } else {
      scanForDependencies(obj[key], deps);
    }
  });
  return deps;
}

function parseJsonManifest(fileContent) {
  const rawContent = JSON.parse(fileContent);
  const result = {};
  result.dependencies = scanForDependencies(rawContent, {});
  if (typeof rawContent.project === 'object') {
    const pData = rawContent.project;
    const name = (pData.restore && pData.restore.projectName);
    result.project = {
      version: pData.version || '0.0.0',
    };
    if (name) {
      result.project.name = name;
    }
  }
  return result;
}

function parseProjectJsonFileContents(fileContent, tree) {
  const installedPackages = [];
  debug('Trying to parse project.json format manifest');
  const projectData = parseJsonManifest(fileContent);
  const rawDependencies = projectData.dependencies;
  debug(rawDependencies);
  if (rawDependencies) {
    for (const name in rawDependencies) {
      // Array<{ "libraryName": "version" }>
      const version = rawDependencies[name];
      const newDependency = new Dependency(name, version, null);
      installedPackages.push(newDependency);
    }
  }
  if (projectData.project) {
    tree.name = projectData.project.name;
    tree.version = projectData.project.version;
  }
  return installedPackages;
}

module.exports = {
  parse: parseProjectJsonFileContents,
};
