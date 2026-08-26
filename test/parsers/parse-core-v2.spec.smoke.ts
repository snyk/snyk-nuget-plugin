import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as plugin from '../../lib';
import * as dotnet from '../../lib/nuget-parser/cli/dotnet';
import { legacyPlugin as pluginApi } from '@snyk/cli-interface';

/**
 * Helper function to run code from within a project directory.
 * This simulates real-world Snyk CLI usage where commands run from the project directory,
 * ensuring that global.json and other project-level files are respected.
 */
async function runInProjectDir<T>(
  projectPath: string,
  fn: (absolutePath: string) => Promise<T>,
): Promise<T> {
  const originalCwd = process.cwd();
  const absoluteProjectPath = path.resolve(originalCwd, projectPath);

  try {
    process.chdir(absoluteProjectPath);
    return await fn(absoluteProjectPath);
  } finally {
    process.chdir(originalCwd);
  }
}

describe('generating v3 depgraphs using all supported .NET SDKs', () => {
  it.each([
    {
      description: 'parse dotnet 6.0 without publish',
      projectPath: './test/fixtures/dotnetcore/dotnet_6',
      expectedGraphFileName: 'expected_depgraph-v3.json',
    },
  ])(
    'succeeds given a project file and returns a single dependency graph for single-targetFramework projects: $description',
    async ({ projectPath, expectedGraphFileName }) => {
      await runInProjectDir(projectPath, async (absoluteProjectPath) => {
        // Run a dotnet restore beforehand, in order to be able to supply a project.assets.json file
        await dotnet.restore('.');
        const manifestFilePath = path.resolve('obj', 'project.assets.json');

        const result = await plugin.inspect(
          absoluteProjectPath,
          manifestFilePath,
          {
            'dotnet-runtime-resolution': true,
          },
        );

        if (!pluginApi.isMultiResult(result)) {
          throw new Error('expected a multiResult response from inspection');
        }

        expect(result.scannedProjects.length).toEqual(1);

        const expectedGraph = JSON.parse(
          fs.readFileSync(path.resolve(expectedGraphFileName), 'utf-8'),
        );
        expect(result.scannedProjects[0].depGraph?.toJSON()).toEqual(
          expectedGraph.depGraph,
        );
      });
    },
  );
});
