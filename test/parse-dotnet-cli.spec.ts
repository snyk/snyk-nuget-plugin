import { describe, expect, it } from '@jest/globals';
import * as plugin from '../lib';
import * as fs from 'fs';
import * as path from 'path';

describe('when parsing .NET CLI', () => {
  describe('when calling with various configs', () => {
    it('parse dotnet-cli project without frameworks field', async () => {
      const projectPath = './test/stubs/dummy_project_2/';
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
        projectPath: './test/stubs/dotnet_2',
      },
      {
        description: 'parse dotnet netcoreapp2.0 with duplicate deps project and traverse packages',
        projectPath: './test/stubs/dotnet_project',
      },
      // {
      //   description: 'parse net6.0 project',
      //   projectPath: './test/stubs/dotnet_6',
      // },
    ])('should succeed given a project file and an expected tree', async ({ projectPath }) => {
      const manifestFile = 'obj/project.assets.json';
      const expectedTree = JSON.parse(
        fs.readFileSync(path.resolve(projectPath, 'expected.json'), 'utf-8'),
      );

      const result = await plugin.inspect(projectPath, manifestFile);
      expect(result.package).toEqual(expectedTree.package);
    });
  });

  describe('when calling with various configs', () => {
    const packagesConfigOnlyPath = './test/stubs/packages-config-only/';
    const packagesConfigOnlyManifestFile = 'packages.config';
    const packageConfigWithNet4TFPath = './test/stubs/packages-config-net4/';
    const packageConfigWithNet4TFManifestFile = 'packages.config';

    it('parse dotnet-cli project with packages.config only', async () => {
      const res = await plugin.inspect(
        packagesConfigOnlyPath,
        packagesConfigOnlyManifestFile,
      );
      expect(res.package.name).toBe('packages-config-only');
      // expect the first found targetRuntime to be returned by the plugin
      expect(res.plugin.targetRuntime).toBe('net452');
      expect(res.package.dependencies.jQuery).toBeTruthy();
      expect(res.package.dependencies['Moment.js']).toBeTruthy();
    });

    it('parse dotnet-cli project with packages.config containing net4 as target framework', async () => {
      const res = await plugin.inspect(
        packageConfigWithNet4TFPath,
        packageConfigWithNet4TFManifestFile,
      );
      expect(res.package.name).toBe('packages-config-net4');
      // expect the first found targetRuntime to be returned by the plugin
      expect(res.plugin.targetRuntime).toBe('net4');
      expect(res.package.dependencies.jQuery).toBeTruthy();
      expect(res.package.dependencies.Unity).toBeTruthy();
    });
  });
});
