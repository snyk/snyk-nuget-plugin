import { describe, expect, it } from '@jest/globals';
import * as plugin from '../lib';
import { inspect } from '../lib';

describe('when parsing packages.config', () => {
  it('should create dep tree for package encoded with utf8 with bom', async () => {
    const fixturePath = './test/stubs/packages-config-with-utf16-packages/';

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
    const projectPath = './test/stubs/packages-config-no-deps/';
    await plugin.inspect(projectPath, 'packages.config', {
      packagesFolder: projectPath + './_packages',
    });
  });

  it.each([
    {
      projectPath: 'test/stubs/target_framework/no_csproj',
      manifestFile: 'obj/project.assets.json',
      defaultName: 'no_csproj',
    },
    {
      projectPath: 'test/stubs/packages-config-only',
      manifestFile: 'packages.config',
      defaultName: 'packages-config-only',
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
