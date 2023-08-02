import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as plugin from '../../lib';
import * as nugetParser from '../../lib/nuget-parser';
import * as dotnet from '../../lib/nuget-parser/cli/dotnet';
import { ManifestType } from '../../lib/nuget-parser/types';

describe('when generating depGraphs and runtime assemblies using the v2 parser', () => {
  it.each([
    {
      description: 'parse dotnet 6.0',
      projectPath: './test/fixtures/dotnetcore/dotnet_6',
    },
    {
      description: 'parse netstandard 2.1',
      projectPath: './test/fixtures/dotnetcore/netstandard_21',
    },
  ])(
    'should succeed given a project file and an expected graph for test: $description',
    async ({ projectPath }) => {
      // Run a dotnet restore beforehand, in order to be able to supply a project.assets.json file
      await dotnet.restore(projectPath);

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
    const projectPath = './test/fixtures/dotnetcore/dotnet_6';

    // Run a dotnet restore beforehand, in order to be able to supply a project.assets.json file
    await dotnet.restore(projectPath);

    // First generate the graph normally without new functionality.
    let useRuntimeDependencies = false;
    const baseline = await nugetParser.buildDepGraphFromFiles(
      projectPath,
      'obj/project.assets.json',
      ManifestType.DOTNET_CORE,
      false,
      useRuntimeDependencies,
    );

    // Then do the same with the new functionality and validate the graph looks the same, only newer versions for runtime dependencies.
    useRuntimeDependencies = true;
    const withRuntimeDeps = await nugetParser.buildDepGraphFromFiles(
      projectPath,
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

  it.each([
    {
      description: 'net472 - with package.assets.json',
      projectPath: './test/fixtures/target-framework/no-dependencies',
      manifestFile: 'obj/project.assets.json',
    },
    {
      description: 'net461 - no package.assets.json',
      projectPath: './test/fixtures/packages-config/repositories-config/',
      manifestFile: 'project.json',
    },
  ])(
    'does not allow the runtime option to be set on unsupported projects: description',
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
