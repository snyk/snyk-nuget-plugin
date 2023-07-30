import * as parseXML from 'xml2js';
import * as debugModule from 'debug';
import { Dependency, fromPackagesConfigEntry } from '../dependency';
import { TargetFramework } from '../types';
import * as depsParser from 'dotnet-deps-parser';
import { toReadableFramework } from '../framework';

const debug = debugModule('snyk');

export function parse(fileContent) {
  const installedPackages: Dependency[] = [];
  debug('Trying to parse packages.config manifest');
  parseXML.parseString(fileContent, (err, result) => {
    if (err) {
      throw err;
    } else {
      const packages = result.packages.package || [];

      packages.forEach(function scanPackagesConfigNode(node) {
        const installedDependency = fromPackagesConfigEntry(node);
        installedPackages.push(installedDependency);
      });
    }
  });
  return installedPackages;
}

export async function getMinimumTargetFramework(
  fileContent: string,
): Promise<TargetFramework | undefined> {
  const extractedFrameworks =
    await depsParser.extractTargetFrameworksFromProjectConfig(fileContent);

  if (extractedFrameworks && extractedFrameworks.length > 0) {
    const minimumFramework = extractedFrameworks.reduce((prev, curr) =>
      prev < curr ? prev : curr,
    );
    return toReadableFramework(minimumFramework);
  }

  return undefined;
}
