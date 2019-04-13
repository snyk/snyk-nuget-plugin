'use strict';
const debug = require('debug')('snyk');
const _ = require('lodash');

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

function parseProjectAssetsFileContent(fileContent, tree, useProjectNameFromAssetsFile) {
  debug('Trying to parse package reference manifest');

  let manifest = JSON.parse(fileContent);
  try {
    validateManifest(manifest);
  } catch (error) {
    debug('Invalid project.assets.json manifest file');
    throw(error)
  }

  if (manifest.project.version) {
    tree.version = manifest.project.version;
  }

  if (useProjectNameFromAssetsFile) {
    if(manifest.project.restore.projectName) {
      tree.name = manifest.project.restore.projectName;
    } else {
      debug("project.assets.json file doesn't contain a value for 'projectName'. Using default value.");
    }
  }

  return manifest;
}

module.exports = {
  parse: parseProjectAssetsFileContent,
};
