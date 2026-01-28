import { describe, expect, it } from '@jest/globals';
import * as plugin from '../lib';
import * as fs from 'fs';
import * as path from 'path';
import * as dotnet from '../lib/nuget-parser/cli/dotnet';
import * as depGraphLib from '@snyk/dep-graph';
import * as depGraphLegacyLib from '@snyk/dep-graph/dist/legacy';
import { legacyPlugin as pluginApi } from '@snyk/cli-interface';
import { NotSupportedEcosystem } from '../lib/errors';

const INSPECT_OPTIONS = {};

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

      const result = await plugin.inspect(
        projectPath,
        manifestFile,
        INSPECT_OPTIONS,
      );
      if (pluginApi.isMultiResult(result) || !result?.package?.dependencies) {
        throw new Error('received invalid depTree');
      }

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

  it('fails gracefully on malformed packages.config', async () => {
    const filePath = './test/fixtures/packages-config/malformed/';
    const manifestFile = 'packages.config';

    await expect(
      async () => await plugin.inspect(filePath, manifestFile, INSPECT_OPTIONS),
    ).rejects.toThrow('Could not find a <packages> tag');
  });

  it('fails gracefully on NX build platform project', async () => {
    const filePath = './test/fixtures/npm-nx-build-platform/';
    const manifestFile = 'project.json';

    await expect(
      async () => await plugin.inspect(filePath, manifestFile, INSPECT_OPTIONS),
    ).rejects.toThrow(NotSupportedEcosystem);
  });

  it('should parse dotnet-cli project with packages.config only', async () => {
    const packagesConfigOnlyPath =
      './test/fixtures/packages-config/config-only/';
    const packagesConfigOnlyManifestFile = 'packages.config';

    const result = await plugin.inspect(
      packagesConfigOnlyPath,
      packagesConfigOnlyManifestFile,
      INSPECT_OPTIONS,
    );

    if (pluginApi.isMultiResult(result) || !result?.package?.dependencies) {
      throw new Error('received invalid depTree');
    }

    expect(result.package.name).toBe('config-only');
    // expect the first found runtime to be returned by the plugin
    expect(result.plugin.targetRuntime).toBe('net452');
    expect(result.package.dependencies.jQuery).toBeTruthy();
    expect(result.package.dependencies['Moment.js']).toBeTruthy();
  });

  it('should parse dotnet-cli project with packages.config containing net4 as target framework', async () => {
    const packageConfigWithNet4TFPath = './test/fixtures/packages-config/net4/';
    const packageConfigWithNet4TFManifestFile = 'packages.config';

    const result = await plugin.inspect(
      packageConfigWithNet4TFPath,
      packageConfigWithNet4TFManifestFile,
      INSPECT_OPTIONS,
    );

    if (pluginApi.isMultiResult(result) || !result?.package?.dependencies) {
      throw new Error('received invalid depTree');
    }

    expect(result.package.name).toBe('net4');
    // expect the first found runtime to be returned by the plugin
    expect(result.plugin.targetRuntime).toBe('net4');
    expect(result.package.dependencies.jQuery).toBeTruthy();
    expect(result.package.dependencies.Unity).toBeTruthy();
  });

  it.each([
    {
      projectPath: './test/fixtures/target-framework/no-csproj',
      manifestFile: 'obj/project.assets.json',
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
      const result = await plugin.inspect(projectPath, manifestFile, {
        'project-name-prefix': 'custom-prefix/',
        ...INSPECT_OPTIONS,
      });

      if (pluginApi.isMultiResult(result) || !result?.package) {
        throw new Error('received invalid depTree');
      }
      expect(result.package.name).toEqual(`custom-prefix/${defaultName}`);
    },
  );
});
