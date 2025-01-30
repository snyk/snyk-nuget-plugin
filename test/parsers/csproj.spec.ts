import { getTargetFrameworksFromProjFile } from '../../lib/nuget-parser/parsers/csproj-parser';
import { describe, expect, it } from '@jest/globals';
import * as plugin from '../../lib';
import { legacyPlugin as pluginApi } from '@snyk/cli-interface';

describe('parse .csproj', () => {
  describe('getTargetFrameworksFromProjFile', () => {
    it.each([
      {
        description: 'it is in property group that is not first',
        fixture:
          './test/fixtures/target-framework/target-framework-version-in-non-first-property-group',
        expected: [
          {
            framework: '.NETFramework',
            original: 'v4.7.2',
            version: '4.7.2',
          },
        ],
      },
      {
        description: 'multiple target frameworks are available',
        fixture: './test/fixtures/target-framework/csproj-multiple',
        expected: [
          {
            framework: '.NETCore',
            original: 'netcoreapp2.0',
            version: '2.0',
          },
          {
            framework: '.NETFramework',
            original: 'net462',
            version: '462',
          },
        ],
      },
      {
        description: 'target framework is not available in project file',
        fixture: './test/fixtures/target-framework/no-target-framework',
        expected: [],
      },
      {
        description:
          'target framework is not available in project file when property group exists',
        fixture: './test/fixtures/target-framework/no-target-framework2',
        expected: [],
      },
      {
        description: 'manifest file is UTF-16LE encoded',
        fixture: './test/fixtures/target-framework/target-framework-utf16le',
        expected: [
          { framework: '.NETFramework', original: 'net462', version: '462' },
        ],
      },
    ])('should parse if $description', ({ fixture, expected }) => {
      const targetFrameworks = getTargetFrameworksFromProjFile(fixture);
      expect(targetFrameworks).toMatchObject(expected);
    });
  });

  describe('parse project.assets.json', () => {
    it('parse dotnet with vbproj', async () => {
      const noProjectPath = './test/fixtures/target-framework/no-csproj/';

      const result = await plugin.inspect(
        noProjectPath,
        'obj/project.assets.json',
      );

      if (
        pluginApi.isMultiResult(result) ||
        !result?.package ||
        !result?.plugin
      ) {
        throw new Error('received invalid depTree');
      }

      expect(result.package.name).toBe('no-csproj');
      expect(result.plugin.targetRuntime).toBe('netcoreapp2.0');
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
