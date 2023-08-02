import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as plugin from '../../lib';
import * as dotnet from '../../lib/nuget-parser/cli/dotnet';
import * as path from 'path';

describe('when parsing .NET core', () => {
  describe('with different target monikers', () => {
    it.each([
      {
        description: 'different target monikers',
        projectPath: './test/fixtures/dotnetcore/netcoreapp20_target_monikers_differ/',
      },
      {
        description: 'assembly name from .csproj',
        projectPath: './test/fixtures/dotnetcore/netcoreapp20_different_assembly_name/',
      },
    ])(
      'parses correctly when inspecting a project with: $description',
      async ({ projectPath }) => {
        await dotnet.restore(projectPath);

        const manifestFile = 'obj/project.assets.json';
        const expectedTree = JSON.parse(
          fs.readFileSync(path.resolve(projectPath, 'expected.json'), 'utf-8'),
        );

        const result = await plugin.inspect(projectPath, manifestFile);
        expect(result).toEqual(expectedTree);
      },
    );
  });
});
