import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as plugin from '../../lib';
import * as dotnet from '../../lib/nuget-parser/cli/dotnet';
import { legacyPlugin as pluginApi } from '@snyk/cli-interface';

describe('generating v2 depgraphs using all supported .NET SDKs', () => {
  it.each([
    {
      description: 'parse dotnet 6.0',
      projectPath: './test/fixtures/dotnetcore/dotnet_6',
    },
  ])(
    'succeeds given a project file and returns a single dependency graph for single-targetFramework projects: $description',
    async ({ projectPath }) => {
      // Run a dotnet restore beforehand, in order to be able to supply a project.assets.json file
      await dotnet.restore(projectPath);
      const manifestFilePath = path.resolve(
        projectPath,
        'obj',
        'project.assets.json',
      );

      const result = await plugin.inspect(projectPath, manifestFilePath, {
        'dotnet-runtime-resolution': true,
        useFixForImprovedDotnetFalsePositives: true,
      });

      if (!pluginApi.isMultiResult(result)) {
        throw new Error('expected a multiResult response from inspection');
      }

      expect(result.scannedProjects.length).toEqual(1);

      const expectedGraph = JSON.parse(
        fs.readFileSync(
          path.resolve(projectPath, 'expected_depgraph-v2.json'),
          'utf-8',
        ),
      );
      expect(result.scannedProjects[0].depGraph?.toJSON()).toEqual(
        expectedGraph.depGraph,
      );
    },
  );
});
