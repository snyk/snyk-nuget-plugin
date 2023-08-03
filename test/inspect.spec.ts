import { describe, expect, it } from '@jest/globals';
import * as plugin from '../lib';
import * as fs from 'fs';
import * as path from 'path';

describe('when calling plugin.inspect with various configs', () => {
  it('should parse dotnet-cli project without frameworks field', async () => {
    const projectPath = './test/fixtures/dotnetcore/without-frameworks-field/';
    const manifestFile = 'obj/project.assets.json';

    await expect(
      async () =>
        await plugin.inspect(projectPath, manifestFile, {
          packagesFolder: projectPath + './_packages',
        }),
    ).rejects.toThrow('No frameworks were found in project.assets.json');
  });

  it.each([
    {
      description: 'parse dotnet netcoreapp2.0',
      projectPath: './test/fixtures/dotnetcore/dotnet_2',
    },
    {
      description:
        'parse dotnet netcoreapp2.0 with duplicate deps project and traverse packages',
      projectPath: './test/fixtures/dotnetcore/dotnet_project',
    },
  ])(
    'should succeed given a project file and an expected tree when: $description',
    async ({ projectPath }) => {
      const manifestFile = 'obj/project.assets.json';
      const expectedTree = JSON.parse(
        fs.readFileSync(path.resolve(projectPath, 'expected.json'), 'utf-8'),
      );

      const result = await plugin.inspect(projectPath, manifestFile);
      expect(result).toHaveProperty('package');
      expect(result.package).toEqual(expectedTree.package);
    },
  );

  it('should parse dotnet-cli project with packages.config only', async () => {
    const packagesConfigOnlyPath =
      './test/fixtures/packages-config/config-only/';
    const packagesConfigOnlyManifestFile = 'packages.config';

    const res = await plugin.inspect(
      packagesConfigOnlyPath,
      packagesConfigOnlyManifestFile,
    );
    expect(res.package.name).toBe('config-only');
    // expect the first found targetRuntime to be returned by the plugin
    expect(res.plugin.targetRuntime).toBe('net452');
    expect(res.package.dependencies.jQuery).toBeTruthy();
    expect(res.package.dependencies['Moment.js']).toBeTruthy();
  });

  it('should parse dotnet-cli project with packages.config containing net4 as target framework', async () => {
    const packageConfigWithNet4TFPath = './test/fixtures/packages-config/net4/';
    const packageConfigWithNet4TFManifestFile = 'packages.config';

    const res = await plugin.inspect(
      packageConfigWithNet4TFPath,
      packageConfigWithNet4TFManifestFile,
    );
    expect(res.package.name).toBe('net4');
    // expect the first found targetRuntime to be returned by the plugin
    expect(res.plugin.targetRuntime).toBe('net4');
    expect(res.package.dependencies.jQuery).toBeTruthy();
    expect(res.package.dependencies.Unity).toBeTruthy();
  });

  it.each([
    {
      projectPath: './test/fixtures/target-framework/no-csproj',
      manifestFile: 'obj/project.assets.json',
      defaultName: 'no-csproj',
    },
    {
      projectPath: './test/fixtures/packages-config/config-only',
      manifestFile: 'packages.config',
      defaultName: 'config-only',
    },
  ])(
    `inspect $projectPath with project-name-prefix option`,
    async ({ projectPath, manifestFile, defaultName }) => {
      const res = await plugin.inspect(projectPath, manifestFile, {
        'project-name-prefix': 'custom-prefix/',
      });
      expect(res.package.name).toEqual(`custom-prefix/${defaultName}`);
    },
  );
});
