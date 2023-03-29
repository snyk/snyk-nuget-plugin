import * as JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';
import * as parseXML from 'xml2js';
import * as dependency from './dependency';
import * as debugModule from 'debug';
import { DependencyInfo, DependencyTree, TargetFramework } from './types';
import { Dependency } from './dependency';

const debug = debugModule('snyk');

const targetFrameworkRegex = /([.a-zA-Z]+)([.0-9]+)/;

export async function parseNuspec(
  dep: DependencyInfo,
  targetFramework: TargetFramework,
): Promise<DependencyTree | null> {
  //precaution
  if (!dep) {
    throw new Error(
      'expected DependencyInfo parameter to have value but found it undefined',
    );
  }

  //another precaution
  if (!targetFramework) {
    throw new Error(
      'expected TargetFramework parameter to have value but found it undefined',
    );
  }

  const nuspecContent = await loadNuspecFromAsync(dep);
  if (nuspecContent === null) {
    debug('failed to load nuspec content');
    return null;
  }

  return await _parsedNuspec(nuspecContent, targetFramework, dep.name);
}

async function loadNuspecFromAsync(
  dep: DependencyInfo,
): Promise<string | null> {
  const nupkgPath = path.resolve(
    dep.path,
    dep.name + '.' + dep.version + '.nupkg',
  );

  let nupkgData: Buffer;
  try {
    nupkgData = fs.readFileSync(nupkgPath);
  } catch (err) {
    if (err.code == 'ENOENT') {
      debug('No nupkg file found at ' + nupkgPath);
      return null; //this is needed not to break existing code flow
    } else {
      throw err;
    }
  }
  const nuspecZipData: any = await JSZip.loadAsync(nupkgData);

  const nuspecFile = Object.keys(nuspecZipData.files).find(file => {
    return path.extname(file) === '.nuspec';
  });

  if (!nuspecFile) {
    throw new Error('`failed to read nupkg file from: ${nupkgPath}`');
  }

  if (!nuspecZipData) {
    throw new Error(
      `failed to open nupkg file as an archive from: ${nupkgPath}`,
    );
  }

  const rawNuspecContent = await nuspecZipData.files[nuspecFile].async('text');
  const encoding = detectNuspecContentEncoding(rawNuspecContent);
  const encodedNuspecContent = Buffer.from(rawNuspecContent).toString(encoding);
  const normalisedNuspecContent = removePotentialUtf16Characters(
    encodedNuspecContent,
  );

  return normalisedNuspecContent;
}

//this is exported for testing, but should not executed directly. Hence the '_' in the name.
export async function _parsedNuspec(
  nuspecContent: string,
  targetFramework: TargetFramework,
  depName: string,
): Promise<DependencyTree> {
  const parsedNuspec = await parseXML.parseStringPromise(nuspecContent);
  let ownDeps: Dependency[] = [];

  //note: this will throw if assertion fails
  assertNuspecSchema(nuspecContent, parsedNuspec);

  for (const metadata of parsedNuspec.package.metadata) {
    metadata.dependencies?.forEach(rawDependency => {
      // Find and add target framework version specific dependencies
      const depsForTargetFramework = extractDepsForTargetFramework(
        rawDependency,
        targetFramework,
      );
      if (depsForTargetFramework && depsForTargetFramework.group) {
        ownDeps = ownDeps.concat(
          extractDepsFromRaw(depsForTargetFramework.group.dependency),
        );
      }

      // Find all groups with no targetFramework attribute
      // add their deps
      const depsFromPlainGroups = extractDepsForPlainGroups(rawDependency);

      if (depsFromPlainGroups) {
        depsFromPlainGroups.forEach(depGroup => {
          ownDeps = ownDeps.concat(extractDepsFromRaw(depGroup.dependency));
        });
      }

      // Add the default dependencies
      ownDeps = ownDeps.concat(extractDepsFromRaw(rawDependency.dependency));
    });
  }

  return {
    children: ownDeps,
    name: depName,
  };
}

function assertNuspecSchema(nuspecContent: string, parsedNuspec: any) {
  if (!parsedNuspec.package?.metadata) {
    throw new Error(
      'This is an invalid nuspec file. Package or Metadata xml section is missing. This is a required element. See https://docs.microsoft.com/en-us/nuget/reference/nuspec. The nuspec in question: ' +
        nuspecContent,
    );
  }

  //just in case, this should *not* happen
  if (!Array.isArray(parsedNuspec.package.metadata)) {
    throw new Error(
      'This is an invalid nuspec file; the metadata tag is supposed to be a collection of objects but it is not! The nuspec in question: ' +
        nuspecContent,
    );
  }

  for (const metadata of parsedNuspec.package.metadata) {
    //just in case, this shouldn't happen as this would indicate invalid/malformed nuspec file
    if (metadata == null || typeof metadata !== 'object') {
      throw new Error(
        'Expected elements in a "metadata" tag to be objects, but they were ' +
          typeof metadata +
          ', this is not supposed to happen and is likely due to malformed nuspec file. The nuspec in question: ' +
          nuspecContent,
      );
    }

    if (metadata.dependencies) {
      //just in case, error would indicate malformed nuspec
      if (!Array.isArray(metadata.dependencies)) {
        throw new Error(
          'Expected that "dependencies" tag would be an array but it isn\'t. This is not supposed to happen and is likely due to malformed nuspec file! The nuspec in question: ' +
            nuspecContent,
        );
      }
    }
  }
}

function extractDepsForPlainGroups(rawDependency) {
  if (!rawDependency.group) {
    return [];
  }

  return rawDependency.group.filter(group => {
    // valid group with no attributes or no `targetFramework` attribute
    return group && !(group.$ && group.$.targetFramework);
  });
}

function extractDepsForTargetFramework(rawDependency, targetFramework) {
  if (!rawDependency || !rawDependency.group) {
    return;
  }

  return rawDependency.group
    .filter(group => {
      return (
        group?.$?.targetFramework &&
        targetFrameworkRegex.test(group.$.targetFramework)
      );
    })
    .map(group => {
      const parts = group.$.targetFramework.split(targetFrameworkRegex);
      return {
        framework: parts[1],
        group,
        version: parts[2],
      };
    })
    .sort((a, b) => {
      if (a.framework === b.framework) {
        return Number(b.version) - Number(a.version);
      }

      return a.framework > b.framework ? -1 : 1;
    })
    .find(group => {
      return (
        targetFramework.framework === group.framework &&
        targetFramework.version >= group.version
      );
    });
}

function extractDepsFromRaw(rawDependencies) {
  if (!rawDependencies) {
    return [];
  }

  const deps: dependency.Dependency[] = [];
  rawDependencies.forEach(dep => {
    if (dep && dep.$) {
      deps.push({
        dependencies: {},
        name: dep.$.id,
        version: dep.$.version,
      });
    }
  });

  return deps;
}

enum SupportedEncodings {
  UTF8 = 'utf-8',
  UTF16LE = 'utf-16le',
}

function detectNuspecContentEncoding(
  nuspecContent: string,
): SupportedEncodings {
  // 65533 is a code for replacement character that is unique to UTF-16
  // https://www.unicodepedia.com/unicode/specials/fffd/replacement-character/
  if (nuspecContent.charCodeAt(0) === 65533) {
    return SupportedEncodings.UTF16LE;
  }

  return SupportedEncodings.UTF8;
}

function removePotentialUtf16Characters(input: string): string {
  return input
    .replace(/\uFFFD/g, '')
    .replace(/\uBFEF/g, '')
    .replace(/\uBDBF/g, '')
    .replace(/\uEFBD/g, '');
}
