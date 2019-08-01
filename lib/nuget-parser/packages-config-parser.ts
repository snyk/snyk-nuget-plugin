import * as parseXML from 'xml2js';
import * as debugModule from 'debug';
const debug = debugModule('snyk');
import {Dependency, fromPackagesConfigEntry} from './dependency';

export async function parse(fileContent: string): Promise<Dependency[]>  {
  return new Promise((resolve, reject) => {
    const installedPackages: Dependency[] = [];
    debug('Trying to parse packages.config manifest');
    parseXML.parseString(fileContent, (err, result) => {
      if (err) {
        reject(err);
      } else {
        const packages = result.packages.package || [];

        for (const node of packages) {
          const installedDependency = fromPackagesConfigEntry(node);
          installedPackages.push(installedDependency);
        }
      }
    });
    resolve(installedPackages);
  }) as Promise<Dependency[]>;
}
