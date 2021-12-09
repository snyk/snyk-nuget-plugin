import { FileNotFoundError, FileNotProcessableError } from '../errors';

import * as fs from 'fs';
import * as path from 'path';
import * as parseXML from 'xml2js';
import * as debugModule from 'debug';
import { TargetFramework } from './types';
import { toReadableFramework } from './framework';
const debug = debugModule('snyk');

export async function getTargetFrameworksFromProjFile(
  rootDir: string,
): Promise<TargetFramework | undefined> {
  return new Promise<TargetFramework | undefined>((resolve, reject) => {
    debug('Looking for your .csproj file in ' + rootDir);
    const csprojPath = findFile(rootDir, /.*\.csproj$/);
    if (!csprojPath) {
      debug('.csproj file not found in ' + rootDir + '.');
      resolve(undefined);
      return;
    }

    debug('Checking .net framework version in .csproj file ' + csprojPath);

    const csprojContents = fs.readFileSync(csprojPath);

    let targetFrameworks: (TargetFramework | undefined)[] = [];
    parseXML.parseString(csprojContents, (err, parsedCsprojContents) => {
      if (err) {
        reject(new FileNotProcessableError(err));
        return;
      }

      const parsedTargetFrameworks =
        parsedCsprojContents?.Project?.PropertyGroup?.reduce(
          (targetFrameworks, propertyGroup) => {
            const targetFrameworkSource =
              propertyGroup?.TargetFrameworkVersion?.[0] ||
              propertyGroup?.TargetFramework?.[0] ||
              propertyGroup?.TargetFrameworks?.[0] ||
              '';

            return targetFrameworks
              .concat(targetFrameworkSource.split(';'))
              .filter(Boolean);
          },
          [],
        ) || [];

      if (parsedTargetFrameworks.length < 1) {
        debug(
          'Could not find TargetFrameworkVersion/TargetFramework' +
            '/TargetFrameworks defined in the Project.PropertyGroup field of ' +
            'your .csproj file',
        );
      }
      targetFrameworks = parsedTargetFrameworks
        .map(toReadableFramework)
        .filter(Boolean);
      if (parsedTargetFrameworks.length > 1 && targetFrameworks.length < 1) {
        debug(
          'Could not find valid/supported .NET version in csproj file located at' +
            csprojPath,
        );
      }
      resolve(targetFrameworks[0]);
    });
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
