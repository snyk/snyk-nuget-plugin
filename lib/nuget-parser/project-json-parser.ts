import * as dependency from './dependency';
import * as debugModule from 'debug';
const debug = debugModule('snyk');

function scanForDependencies(obj, deps): JsonManifestDependencies {
  deps = deps || {};
  if (typeof obj !== 'object') {
    return deps;
  }
  for (const key of Object.keys(obj)) {
    if (key === 'dependencies') {
      const dependencies = obj.dependencies;
      for (const dep of Object.keys(dependencies)) {
        const depName = dep;
        let version = dependencies[dep];
        if (typeof version === 'object') {
          version = version.version;
        }
        if (typeof version === 'undefined') {
          version = 'unknown';
        } else {
          version = version.toString();
        }
        deps[depName] = version;
      }
    } else {
      scanForDependencies(obj[key], deps);
    }
  }
  return deps;
}

interface JsonManifestDependencies {
  dependencies: any;
  project?: {
    version: string;
    name: string;
  };
}

function parseJsonManifest(fileContent): JsonManifestDependencies {
  const rawContent = JSON.parse(fileContent);
  const result: JsonManifestDependencies = {
    dependencies: scanForDependencies(rawContent, {}),
  };
  if (typeof rawContent.project === 'object') {
    const pData = rawContent.project;
    const name = pData.restore && pData.restore.projectName;
    result.project = {
      version: pData.version || '0.0.0',
      name,
    };
  }
  return result;
}

export function parse(fileContent, tree) {
  const installedPackages: dependency.Dependency[] = [];
  debug('Trying to parse project.json format manifest');
  const projectData = parseJsonManifest(fileContent);
  const rawDependencies = projectData.dependencies;
  debug(rawDependencies);
  if (rawDependencies) {
    for (const name of Object.keys(rawDependencies)) {
      // Array<{ "libraryName": "version" }>
      const version = rawDependencies[name];
      installedPackages.push({
        dependencies: {},
        name,
        version,
      });
    }
  }
  if (projectData.project) {
    tree.name = projectData.project.name;
    tree.version = projectData.project.version;
  }
  return installedPackages;
}
