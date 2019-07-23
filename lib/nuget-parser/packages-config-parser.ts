import * as parseXML from 'xml2js';
import * as debugModule from 'debug';
const debug = debugModule('snyk');
import * as dependency from './dependency';

export function parse(fileContent) {
  const installedPackages: dependency.Dependency[] = [];
  debug('Trying to parse packages.config manifest');
  parseXML.parseString(fileContent, (err, result) => {
    if (err) {
      throw err;
    } else {
      const packages = result.packages.package || [];

      packages.forEach(
        function scanPackagesConfigNode(node) {
          const installedDependency =
            dependency.fromPackgesConfigEntry(node);
          installedPackages.push(installedDependency);
        });
    }
  });
  return installedPackages;
}
