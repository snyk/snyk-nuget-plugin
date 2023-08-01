import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as plugin from '../../lib';
import * as nugetParser from '../../lib/nuget-parser';
import { ManifestType } from '../../lib/nuget-parser/types';

describe('when generating depGraphs and runtime assemblies using the v2 parser', () => {
  it.each([
    {
      description: 'parse dotnet 6.0',
      projectPath: './test/fixtures/dotnetcore/dotnet_6_published',
    },
  ])(
    'should succeed given a project file and an expected graph for test: $description',
    async ({ projectPath }) => {
      const manifestFile = 'obj/project.assets.json';

      const result = await plugin.inspect(projectPath, manifestFile, {
        'dotnet-runtime-resolution': true,
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
    { useRuntimeDependencies: false, expectedVersion: '4.3.0' },
    { useRuntimeDependencies: true, expectedVersion: '6.0.0' },
  ])(
    'correctly generates a depGraph with or without runtime versions when flag is enabled = $useRuntimeDependencies',
    async ({ useRuntimeDependencies, expectedVersion }) => {
      const baseline = await nugetParser.buildDepGraphFromFiles(
        './test/fixtures/dotnetcore/dotnet_6_published',
        'obj/project.assets.json',
        ManifestType.DOTNET_CORE,
        false,
        useRuntimeDependencies,
      );
      expect(baseline.dependencyGraph).toBeDefined();
      const depGraphBaseline = baseline.dependencyGraph;
      expect(depGraphBaseline.getPkgs()).toContainEqual({
        name: 'System.Net.Http',
        version: expectedVersion,
      });
    },
  );

  it('does not allow the runtime beta option to be set on non-dotnet core projects', async () => {
    const projectPath = './test/fixtures/packages-config/repositories-config/';
    const manifestFile = 'project.json';
    await expect(
      async () =>
        await plugin.inspect(projectPath, manifestFile, {
          'dotnet-runtime-resolution': true,
        }),
    ).rejects.toThrow(
      'runtime resolution beta flag is currently only applicable for .net core projects',
    );
  });
});
