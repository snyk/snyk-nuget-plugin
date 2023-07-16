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

    it('parse dotnet-cli 2 project and traverse packages', async () => {
      const projectPath = './test/stubs/dotnet_project';
      const manifestFile = 'obj/project.assets.json';
      const expectedTree = JSON.parse(
        fs.readFileSync('./test/stubs/dotnet_project/expected.json', 'utf-8'),
      );

      const result = await plugin.inspect(projectPath, manifestFile);
      expect(result).toEqual(expectedTree);
    });

    it('parse dotnet-cli 2 with duplicate deps project and traverse packages', async () => {
      const projectPath = './test/stubs/dotnet_project';
      const manifestFile = 'obj/project.assets.json';
      const expectedTree = JSON.parse(
        fs.readFileSync('./test/stubs/dotnet_project/expected.json', 'utf-8'),
      );
      const result = await plugin.inspect(projectPath, manifestFile);
      expect(result).toEqual(expectedTree);
    });

    it('parse dotnet-cli project and traverse packages', async () => {
      const projectPath = './test/stubs/dotnet_p_g';
      const manifestFile = 'obj/project.assets.json';
      const expectedTree = JSON.parse(
        fs.readFileSync('./test/stubs/dotnet_p_g/expected.json', 'utf-8'),
      );

      const result = await plugin.inspect(projectPath, manifestFile, {
        packagesFolder: path.resolve(projectPath, '_packages'),
      });
      expect(result).toEqual(expectedTree);
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
