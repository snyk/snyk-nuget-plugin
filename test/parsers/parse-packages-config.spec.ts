import { describe, expect, it } from '@jest/globals';
import * as plugin from '../../lib';
import { inspect } from '../../lib';
import * as packagesConfigParser from '../../lib/nuget-parser/parsers/packages-config-parser';
import * as dotNetFrameworkParser from '../../lib/nuget-parser/parsers/dotnet-framework-parser';
import * as fs from 'fs';
import * as path from 'path';
import { InvalidFolderFormatError } from "../../lib/errors/invalid-folder-format-error";

const projectPath = './test/fixtures/packages-config/with-packages-dir';

describe('when calling plugin on projects containing packages.config', () => {
  it('packages contains many deps: only jquery', async () => {
    const appPath = projectPath + '/only_jquery/';
    const manifestFile = 'packages.config';
    const expected = JSON.parse(
      fs.readFileSync(path.resolve(appPath, 'expected.json'), 'utf-8'),
    );

    const result = await plugin.inspect(appPath, manifestFile, {
      packagesFolder: projectPath + '/packages',
    });
    expect(result.package.dependencies.jQuery).toBeTruthy();
    expect(result.package.dependencies['Moment.js']).toBeFalsy();
    expect(result).toEqual(expected);
  });

  it('packages contains many deps: only moment', async () => {
    const appPath = projectPath + '/only_momentjs/';
    const manifestFile = 'packages.config';
    const expected = JSON.parse(
      fs.readFileSync(path.resolve(appPath, 'expected.json'), 'utf-8'),
    );

    const result = await plugin.inspect(appPath, manifestFile, {
      packagesFolder: projectPath + '/packages',
    });
    expect(result.package.dependencies['Moment.js']).toBeTruthy();
    expect(result.package.dependencies.jQuery).toBeFalsy();
    expect(result).toEqual(expected);
  });

  it('packages contains many deps: different jquery version', async () => {
    const appPat = projectPath + '/only_jquery_but_wrong_version/';
    const manifestFile = 'packages.config';
    const expected = JSON.parse(
      fs.readFileSync(path.resolve(appPat, 'expected.json'), 'utf-8'),
    );

    const res = await plugin.inspect(appPat, manifestFile, {
      packagesFolder: projectPath + '/packages',
    });
    expect(res.package.dependencies.jQuery).toBeTruthy();
    expect(res.package.dependencies.jQuery.version === '3.2.1').toBeTruthy();
    expect(res).toEqual(expected);
  });
});

describe('when calling plugin on project containing a repositories.config', () => {
  const projectPath = './test/fixtures/packages-config/repositories-config';

  it('packages contains many deps: only jquery', async () => {
    const manifestFile = 'packages.config';
    const packagesFolder = projectPath + '/packages';
    const expectedTree = JSON.parse(
      fs.readFileSync(path.resolve(projectPath, 'expected.json'), 'utf-8'),
    );
    const result = await plugin.inspect(projectPath, manifestFile, {
      packagesFolder,
    });
    expect(result).toEqual(expectedTree);
  });
});

describe('when parsing packages.config', () => {
  it('should create dep tree for package encoded with utf8 with bom', async () => {
    const fixturePath = './test/fixtures/packages-config/with-utf16-packages/';

    const output = await inspect(fixturePath, 'packages.config', {
      packagesFolder: fixturePath + '/packages',
    });

    expect(output).toEqual({
      package: {
        dependencies: {
          Antlr: {
            dependencies: {},
            name: 'Antlr',
            version: '3.4.1.9004',
          },
          'Microsoft.Web.Infrastructure': {
            dependencies: {},
            name: 'Microsoft.Web.Infrastructure',
            version: '1.0.0.0',
          },
          'Swagger.Net': {
            dependencies: {
              WebActivator: {
                dependencies: {},
                name: 'WebActivator',
                version: '1.5.1',
              },
            },
            name: 'Swagger.Net',
            version: '0.5.5',
          },
        },
        name: 'packages-config-with-utf16-packages',
        packageFormatVersion: 'nuget:0.0.0',
        version: '0.0.0',
      },
      plugin: {
        name: 'snyk-nuget-plugin',
        targetFile: 'packages.config',
        targetRuntime: 'net45',
      },
    });
  });

  it('should parse packages-config-no-deps project successfully', async () => {
    const projectPath = './test/fixtures/packages-config/no-deps/';
    await plugin.inspect(projectPath, 'packages.config', {
      packagesFolder: projectPath + './_packages',
    });
  });

  it.each([
    {
      projectPath: 'test/fixtures/target-framework/no-csproj',
      manifestFile: 'obj/project.assets.json',
      defaultName: 'no-csproj',
    },
    {
      projectPath: 'test/fixtures/config-only',
      manifestFile: 'packages.config',
      defaultName: 'config-only',
    },
  ])(
    'should parse project with and without name prefix',
    async ({ projectPath, manifestFile, defaultName }) => {
      // With prefix
      let res = await plugin.inspect(projectPath, manifestFile, {
        'project-name-prefix': 'custom-prefix/',
      });
      expect(res.package.name).toBe(`custom-prefix/${defaultName}`);

      // Without
      res = await plugin.inspect(projectPath, manifestFile, {});
      expect(res.package.name).toBe(defaultName);
    },
  );
});

describe('when calling getMinimumTargetFramework', () => {
  it.each([
    // give bad content and expect to throw
    '<hello></bye>',
  ])('should throw', async (content) => {
    await expect(
      async () => await packagesConfigParser.getMinimumTargetFramework(content),
    ).rejects.toThrow();
  });

  it.each([
    // give empty content and expect undefined
    '',
    // give no packages but don't expect to throw
    '<?xml version="1.0" encoding="utf-8"?>',
    // give empty packages but don't expect to throw
    `<?xml version="1.0" encoding="utf-8"?>
<packages>
</packages>`,
    // give a file with no targetFramework in the dependencies and expect undefined
    `<?xml version="1.0" encoding="utf-8"?>
<packages>
<package id="jQuery" version="3.2.1" />
</packages>`,
  ])('should NOT throw', async (content) => {
    const result = await packagesConfigParser.getMinimumTargetFramework(
      content,
    );
    await expect(result).toBeUndefined();
  });
});

describe('fromFolderName() method', () => {
  it('should properly fail when parsing folder without expectedVersion', () => {
    expect(() =>
        dotNetFrameworkParser.fromFolderName('someLibraryNameWithoutexpectedVersion'),
    ).toThrow(InvalidFolderFormatError);
  });

  //sanity check
  it.each([
    ['RestSharp.105.2.3', '105.2.3'],
    ['FooBar.1.2', '1.2'],
    ['FooBar1.2', '2'],
  ])("should correctly parse '%s'", (folder, expectedVersion) => {
    const result = dotNetFrameworkParser.fromFolderName(folder);
    expect(result).toBeTruthy();
    expect(result.version).toBe(expectedVersion);
  });
});
