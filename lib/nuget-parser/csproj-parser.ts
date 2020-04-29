import {FileNotFoundError, FileNotProcessableError} from '../errors';

import * as fs from 'fs';
import * as path from 'path';
import * as parseXML from 'xml2js';
import * as _ from '@snyk/lodash';
import * as debugModule from 'debug';
import { TargetFramework } from './types';
import { toReadableFramework } from './framework';
const debug = debugModule('snyk');

export async function getTargetFrameworksFromProjFile(rootDir: string): Promise<TargetFramework | undefined> {
  return new Promise<TargetFramework | undefined>((resolve, reject) => {
    debug('Looking for your .csproj file in ' + rootDir);
    const csprojPath = findFile(rootDir, /.*\.csproj$/);
    if (csprojPath) {
      debug('Checking .net framework version in .csproj file ' + csprojPath);

      const csprojContents = fs.readFileSync(csprojPath);

      let frameworks: TargetFramework[] = [];
      parseXML.parseString(csprojContents, (err, parsedCsprojContents) => {
        if (err) {
          reject(new FileNotProcessableError(err));
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
        resolve(frameworks[0]);
      });
    }
    debug('.csproj file not found in ' + rootDir + '.');
    resolve();
  });
}

function findFile(rootDir, filter) {
  if (!fs.existsSync(rootDir)) {
    throw new FileNotFoundError('No such path: ' + rootDir);
  }
  const files = fs.readdirSync(rootDir);
  for (const file of files) {
    const filename = path.resolve(rootDir, file);

    if (filter.test(filename)) {
      return filename;
    }
  }
}
