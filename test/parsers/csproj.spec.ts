import { getTargetFrameworksFromProjFile } from '../../lib/nuget-parser/parsers/csproj-parser';
import { describe, expect, it } from '@jest/globals';
import * as plugin from '../../lib';

describe('parse .csproj', () => {
  describe('getTargetFrameworksFromProjFile', () => {
    it('should parse target framework version even if it is in property group that is not first', async () => {
      const targetFrameworkInNonFirstPropertyGroup =
        './test/fixtures/target-framework/target-framework-version-in-non-first-property-group';

      const targetFramework = getTargetFrameworksFromProjFile(
        targetFrameworkInNonFirstPropertyGroup,
      );

      expect(targetFramework).toMatchObject({
        framework: '.NETFramework',
        original: 'v4.7.2',
        version: '4.7.2',
      });
    });

    it('should return first target framework if multiple target frameworks are available', async () => {
      const multipleTargetFrameworksPath =
        './test/fixtures/target-framework/csproj-multiple';

      const targetFramework = getTargetFrameworksFromProjFile(
        multipleTargetFrameworksPath,
      );

      expect(targetFramework).toMatchObject({
        framework: '.NETCore',
        original: 'netcoreapp2.0',
        version: '2.0',
      });
    });

    it('should not crash if target framework is not available in project file', async () => {
      const noTargetFrameworksPath =
        './test/fixtures/target-framework/no-target-framework';

      const targetFramework = getTargetFrameworksFromProjFile(
        noTargetFrameworksPath,
      );

      expect(targetFramework).toBeUndefined();
    });

    it('should not crash if target framework is not available in project file when property group exists', async () => {
      const noTargetFrameworksPath2 =
        './test/fixtures/target-framework/no-target-framework2';

      const targetFramework = getTargetFrameworksFromProjFile(
        noTargetFrameworksPath2,
      );

      expect(targetFramework).toBeUndefined();
    });
  });

  describe('parse project.assets.json', () => {
    it('parse dotnet with vbproj', async () => {
      const noProjectPath = './test/fixtures/target-framework/no-csproj/';

      const res = await plugin.inspect(
        noProjectPath,
        'obj/project.assets.json',
      );
      expect(res.package.name).toBe('no-csproj');
      expect(res.plugin.targetRuntime).toBe('netcoreapp2.0');
    });

    it('parse dotnet with no deps', async () => {
      const noDeps = './test/fixtures/target-framework/no-dependencies/';

      const res = await plugin.inspect(noDeps, 'obj/project.assets.json');
      expect(Object.keys(res.package.dependencies).length).toBe(0);
    });

    it('parse dotnet with no valid framework defined', async () => {
      const noValidFrameworksPath =
        './test/fixtures/target-framework/no-target-valid-framework';

      await expect(
        async () =>
          await plugin.inspect(
            noValidFrameworksPath,
            'obj/project.assets.json',
          ),
      ).rejects.toThrow('No frameworks were found in project.assets.json');
    });
  });
});
