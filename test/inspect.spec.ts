import { describe, expect, it } from '@jest/globals';
import * as plugin from '../lib';
import * as fs from 'fs';
import * as path from 'path';
import * as dotnet from '../lib/nuget-parser/cli/dotnet';
import * as depGraphLib from '@snyk/dep-graph';
import * as depGraphLegacyLib from '@snyk/dep-graph/dist/legacy';

describe('when calling plugin.inspect with various configs', () => {
  it.each([
    {
      description: 'parse dotnet netcoreapp3.1',
      projectPath: './test/fixtures/dotnetcore/netcoreapp31/',
    },
    {
      description: 'parse dotnet netcoreapp2.1',
      projectPath: './test/fixtures/dotnetcore/netcoreapp21/',
    },
  ])(
    'should succeed given a project file and an expected tree when: $description',
    async ({ projectPath }) => {
      await dotnet.restore(projectPath);

      const manifestFile = 'obj/project.assets.json';

      const result = await plugin.inspect(projectPath, manifestFile);

      // We're working with legacy depTrees for backwards compatibility, but the fixture to compare with
      // will be over 30MB. So convert it to the much-tighter depGraph just for assertions.
      const expectedGraph = depGraphLib.createFromJSON(
        JSON.parse(
          fs.readFileSync(
            path.resolve(projectPath, 'expected_depgraph.json'),
            'utf-8',
          ),
        ),
      );
      expect(result).toHaveProperty('package');

      const depGraph = await depGraphLegacyLib.depTreeToGraph(
        result.package,
        'dotnet',
      );

      expect(depGraph.equals(expectedGraph)).toBeTruthy();
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
      manifestFile: 'project.assets.json',
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
