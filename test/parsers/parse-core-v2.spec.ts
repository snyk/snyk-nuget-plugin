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

  it('correctly generates a depGraph with or without runtime versions ', async () => {
    // First generate the graph normally without new functionality.
    let useRuntimeDependencies = false;
    const baseline = await nugetParser.buildDepGraphFromFiles(
      './test/fixtures/dotnetcore/dotnet_6_published',
      'obj/project.assets.json',
      ManifestType.DOTNET_CORE,
      false,
      useRuntimeDependencies,
    );

    // Then do the same with the new functionality and validate the graph looks the same, only newer versions for runtime dependencies.
    useRuntimeDependencies = true;
    const withRuntimeDeps = await nugetParser.buildDepGraphFromFiles(
      './test/fixtures/dotnetcore/dotnet_6_published',
      'obj/project.assets.json',
      ManifestType.DOTNET_CORE,
      false,
      useRuntimeDependencies,
    );

    // Assert that the existing logic shows an older version of a runtime dependency:
    expect(baseline.dependencyGraph).toBeDefined();
    expect(baseline.dependencyGraph.getPkgs()).toContainEqual({
      name: 'System.Net.Http',
      version: '4.3.0',
    });

    // Assert that with runtime deps it correctly reflects the net6.0 runtime version:
    expect(withRuntimeDeps.dependencyGraph).toBeDefined();
    expect(withRuntimeDeps.dependencyGraph.getPkgs()).toContainEqual({
      name: 'System.Net.Http',
      version: '6.0.0',
    });

    // Assert that no construction of the depGraph otherwise was destroyed in the process,
    // by looking at a non-runtime dependencies relations to the graph:
    const pkg = { name: 'Microsoft.NETCore.Targets', version: '1.1.0' };

    // Map the list to ignore versions for easier comparison, as it will otherwise fail with versions being different
    // between baseline and runtime:
    const baselinePathsToRoot = baseline.dependencyGraph
      .pkgPathsToRoot(pkg)
      .map((inner) => inner.map(({ name }) => ({ name })));

    const withRuntimeDepsPathsToRoot = withRuntimeDeps.dependencyGraph
      .pkgPathsToRoot(pkg)
      .map((inner) => inner.map(({ name }) => ({ name })));

    expect(withRuntimeDepsPathsToRoot.length).toEqual(
      baselinePathsToRoot.length,
    );
  });

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
