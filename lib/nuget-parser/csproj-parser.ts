import {FileNotFoundError, FileNotProcessableError} from '../errors';

import * as fs from 'fs';
import * as path from 'path';
import * as parseXML from 'xml2js';
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

      let frameworks: (TargetFramework | undefined)[] = [];
      parseXML.parseString(csprojContents, (err, parsedCsprojContents) => {
        if (err) {
          reject(new FileNotProcessableError(err));
        }
        const versionLoc = parsedCsprojContents?.Project?.PropertyGroup?.[0];
        const versions = [].concat(
          (versionLoc?.TargetFrameworkVersion?.[0] ||
          versionLoc?.TargetFramework?.[0] ||
          versionLoc?.TargetFrameworks?.[0] || '').split(';')).filter(Boolean);

        if (versions.length < 1) {
          debug('Could not find TargetFrameworkVersion/TargetFramework' +
            '/TargetFrameworks defined in the Project.PropertyGroup field of ' +
            'your .csproj file');
        }
        frameworks = versions.map(toReadableFramework).filter(Boolean);
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
