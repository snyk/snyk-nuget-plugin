import * as parseXML from 'xml2js';
import * as debugModule from 'debug';
import { Dependency, TargetFramework } from '../types';
import * as depsParser from 'dotnet-deps-parser';
import { toReadableFramework } from '../framework';
import { InvalidManifestError } from '../../errors';

const debug = debugModule('snyk');

export function fromPackagesConfigEntry(manifest) {
  debug(
    'Extracting by packages.config entry:' +
      ' name = ' +
      manifest.$.id +
      ' version = ' +
      manifest.$.version,
  );
  return {
    dependencies: {},
    name: manifest.$.id,
    version: manifest.$.version,
  };
}

export function parse(fileContent) {
  const installedPackages: Dependency[] = [];
  debug('Trying to parse packages.config manifest');
  parseXML.parseString(fileContent, (err, result) => {
    if (err) {
      throw err;
    }
    if (!('packages' in result)) {
      throw new InvalidManifestError(
        `Could not find a <packages> tag in your packages.config file. Please read this guide \x1b[4mhttps://learn.microsoft.com/en-us/nuget/reference/packages-config#schema\x1b[0m.`,
      );
    }

    const packages = result.packages.package || [];
    packages.forEach(function scanPackagesConfigNode(node) {
      const installedDependency = fromPackagesConfigEntry(node);
      installedPackages.push(installedDependency);
    });
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
