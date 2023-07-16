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
      expect(result.depGraph?.toJSON()).toEqual(expectedTree.depGraph);
    },
  );
});
