import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as plugin from '../../lib';
import * as dotnet from '../../lib/nuget-parser/cli/dotnet';
import { legacyPlugin as pluginApi } from '@snyk/cli-interface';

describe('when generating depGraphs and runtime assemblies using the v2 parser', () => {
  it.each([
    {
      description: 'parse dotnet 6.0',
      projectPath: './test/fixtures/dotnetcore/dotnet_6',
      targetFramework: undefined,
    },
    {
      description: 'parse netstandard 2.1',
      projectPath: './test/fixtures/dotnetcore/netstandard21',
      targetFramework: undefined,
    },
    {
      description: 'parse dotnet 6.0 and 7.0 but specify a targetFramework',
      projectPath: './test/fixtures/dotnetcore/dotnet_6_and_7',
      targetFramework: 'net7.0',
    },
    {
      description: 'parse dotnet 7.0 when using Directory.Build.props',
      projectPath: './test/fixtures/props/build-props/App',
      targetFramework: undefined,
    },
  ])(
    'succeeds given a project file and returns a single dependency graph for single-targetFramework projects: $description',
    async ({ projectPath, targetFramework }) => {
      // Run a dotnet restore beforehand, in order to be able to supply a project.assets.json file
      await dotnet.restore(projectPath);

      const manifestFile = 'obj/project.assets.json';

      const result = await plugin.inspect(projectPath, manifestFile, {
        'dotnet-runtime-resolution': true,
        'dotnet-target-framework': targetFramework,
      });

      if (!pluginApi.isMultiResult(result)) {
        throw new Error('expected a multiResult response from inspection');
      }

      expect(result.scannedProjects.length).toEqual(1);

      const expectedGraph = JSON.parse(
        fs.readFileSync(
          path.resolve(projectPath, 'expected_depgraph.json'),
          'utf-8',
        ),
      );
      expect(result.scannedProjects[0].depGraph?.toJSON()).toEqual(
        expectedGraph.depGraph,
      );
    },
  );

  it.each([
    {
      description: 'parse dotnet 6.0 and 7.0',
      projectPath: './test/fixtures/dotnetcore/dotnet_6_and_7',
      expectedDepGraphs: 2,
    },
  ])(
    'succeeds given a project file and returns multiple dependency graphs for multi-targetFramework projects: $description',
    async ({ projectPath, expectedDepGraphs }) => {
      // Run a dotnet restore beforehand, in order to be able to supply a project.assets.json file
      await dotnet.restore(projectPath);

      const manifestFile = 'obj/project.assets.json';

      const result = await plugin.inspect(projectPath, manifestFile, {
        'dotnet-runtime-resolution': true,
      });

      if (!pluginApi.isMultiResult(result)) {
        throw new Error('expected a multiResult response from inspection');
      }

      expect(result.scannedProjects.length).toEqual(expectedDepGraphs);

      const expectedGraphs = JSON.parse(
        fs.readFileSync(
          path.resolve(projectPath, 'expected_depgraphs.json'),
          'utf-8',
        ),
      );

      result.scannedProjects.forEach((scannedProject, i) => {
        expect(scannedProject.depGraph?.toJSON()).toEqual(expectedGraphs[i]);
      });
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
