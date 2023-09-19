import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as plugin from '../../lib';
import * as dotnet from '../../lib/nuget-parser/cli/dotnet';

describe('when generating depGraphs and runtime assemblies using the v2 parser', () => {
  it.each([
    {
      description: 'parse dotnet 6.0',
      projectPath: './test/fixtures/dotnetcore/dotnet_6',
    },
    {
      description: 'parse netstandard 2.1',
      projectPath: './test/fixtures/dotnetcore/netstandard21',
    },
    {
      description: 'parse dotnet 6.0 and 7.0 but specify a targetFramework',
      projectPath: './test/fixtures/dotnetcore/dotnet_6_and_7',
      targetFramework: 'net7.0',
    },
  ])(
    'should succeed given a project file and an expected graph for test: $description',
    async ({ projectPath, targetFramework }) => {
      // Run a dotnet restore beforehand, in order to be able to supply a project.assets.json file
      await dotnet.restore(projectPath);

      const manifestFile = 'obj/project.assets.json';

      const result = await plugin.inspect(projectPath, manifestFile, {
        'dotnet-runtime-resolution': true,
        'target-framework': targetFramework,
      });

      const expectedGraph = JSON.parse(
        fs.readFileSync(
          path.resolve(projectPath, 'expected_depgraph.json'),
          'utf-8',
        ),
      );
      expect(result.dependencyGraph?.toJSON()).toEqual(expectedGraph.depGraph);
    },
  );

  it.each([
    {
      description: 'net472 - with package.assets.json',
      projectPath: './test/fixtures/target-framework/no-dependencies/',
      manifestFile: 'obj/project.assets.json',
    },
    {
      description: 'net461 - no package.assets.json',
      projectPath: './test/fixtures/packages-config/repositories-config/',
      manifestFile: 'project.json',
    },
  ])(
    'does not allow the runtime option to be set on unsupported projects: $description',
    async ({ projectPath, manifestFile }) => {
      await expect(
        async () =>
          await plugin.inspect(projectPath, manifestFile, {
            'dotnet-runtime-resolution': true,
          }),
      ).rejects.toThrow(/runtime resolution flag is currently only supported/);
    },
  );
});
