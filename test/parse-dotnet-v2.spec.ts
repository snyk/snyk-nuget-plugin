import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as plugin from '../lib';

describe('when generating depGraphs and runtime assemblies using the v2 parser', () => {
  it.each([
    {
      description: 'parse dotnet 6.0',
      projectPath: './test/stubs/dotnet_6',
    },
  ])(
    'should succeed given a project file and an expected graph for test: $description',
    async ({ projectPath }) => {
      const manifestFile = 'obj/project.assets.json';

      const result = await plugin.inspect(projectPath, manifestFile, {
        'dotnet-runtime-resolution-beta': true,
      });

      const expectedTree = JSON.parse(
        fs.readFileSync(
          path.resolve(projectPath, 'expected_depgraph.json'),
          'utf-8',
        ),
      );
      expect(result.dependencyGraph?.toJSON()).toEqual(expectedTree.depGraph);
    },
  );

  it('does not allow the runtime beta option to be set on non-dotnet core projects', async () => {
    const projectPath = './test/stubs/dummy_project_1/dummy_project_1';
    const manifestFile = 'project.json';
    await expect(
      async () =>
        await plugin.inspect(projectPath, manifestFile, {
          'dotnet-runtime-resolution-beta': true,
        }),
    ).rejects.toThrow(
      'runtime resolution beta flag is currently only applicable for .net core projects',
    );
  });
});
