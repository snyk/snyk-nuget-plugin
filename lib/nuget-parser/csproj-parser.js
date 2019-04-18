'use strict';
const fs = require('fs');
const path = require('path');
const parseXML = require('xml2js').parseString;
const debug = require('debug')('snyk');
const _ = require('lodash');

function getTargetFrameworksFromProjFile(rootDir) {
  debug('Looking for your .csproj file in ' + rootDir);
  const csprojPath = findFile(rootDir, /.*\.csproj$/);
  if (csprojPath) {
    debug('Checking .net framework version in .csproj file ' + csprojPath);

    const csprojContents = fs.readFileSync(csprojPath);

    let frameworks = [];
    parseXML(csprojContents, function (err, parsedCsprojContents) {
      if (err) {
        throw err;
      }
      const versionLoc = _.get(parsedCsprojContents, 'Project.PropertyGroup[0]');
      const versions = _.compact(_.concat([],
        _.get(versionLoc, 'TargetFrameworkVersion[0]') ||
        _.get(versionLoc, 'TargetFramework[0]') ||
        _.get(versionLoc, 'TargetFrameworks[0]', '').split(';')));

      if (versions.length < 1) {
        debug('Could not find TargetFrameworkVersion/TargetFramework' +
          '/TargetFrameworks defined in the Project.PropertyGroup field of ' +
          'your .csproj file');
      }
      frameworks = _.compact(_.map(versions, toReadableFramework));
      if (versions.length > 1 && frameworks.length < 1) {
        debug('Could not find valid/supported .NET version in csproj file located at' + csprojPath);
      }
    });
    return frameworks[0];
  }
  debug('.csproj file not found in ' + rootDir + '.');
}

function toReadableFramework(targetFramework) {
  const typeMapping = {
    v: '.NETFramework',
    net: '.NETFramework',
    netstandard: '.NETStandard',
    netcoreapp: '.NETCore',
  };

  for (const type in typeMapping) {
    if (new RegExp(type + /\d.?\d(.?\d)?$/.source).test(targetFramework)) {
      return {
        framework: typeMapping[type],
        version: targetFramework.split(type)[1],
        original: targetFramework,
      };
    }
  }
}

function findFile(rootDir, filter) {
  if (!fs.existsSync(rootDir)) {
    throw new Error('No such path: ' + rootDir);
  }
  const files = fs.readdirSync(rootDir);
  for (let i = 0; i < files.length; i++) {
    const filename = path.resolve(rootDir, files[i]);

    if (filter.test(filename)) {
      return filename;
    }
  }
}

module.exports = getTargetFrameworksFromProjFile;
