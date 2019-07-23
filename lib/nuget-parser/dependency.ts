import * as debugModule from 'debug';
const debug = debugModule('snyk');

export interface Dependency {
  name: string;
  version: string;
  dependencies: any;
}

export function cloneShallow(dep: Dependency): Dependency {
  // clone, without the dependencies
  return {
    dependencies: {},
    name: dep.name,
    version: dep.version,
  };
}

function extractFromDotVersionNotation(expression) {
  const versionRef =
    /(?=\S+)(?=\.{1})((\.\d+)+((-?\w+\.?\d*)|(\+?[0-9a-f]{5,40}))?)/
      .exec(expression)![0];
  const name = expression.split(versionRef)[0];
  return {
    name,
    version: versionRef.slice(1),
  };
}

export function fromFolderName(folderName) {
  debug('Extracting by folder name ' + folderName);
  const info = extractFromDotVersionNotation(folderName);
  return {
    dependencies: {},
    name: info.name,
    version: info.version,
  };
}

export function fromPackgesConfigEntry(manifest) {
    debug('Extracting by packages.config entry:' +
      ' name = ' + manifest.$.id +
      ' version = ' + manifest.$.version);
    return {
      dependencies: {},
      name: manifest.$.id,
      version: manifest.$.version,
    };
}
