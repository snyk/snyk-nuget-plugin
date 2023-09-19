import { describe, expect, it } from '@jest/globals';
import * as depGraphLib from '@snyk/dep-graph';
import * as nugetParser from '../lib/nuget-parser';
import { ManifestType } from '../lib/nuget-parser/types';
import * as tempFixture from './helpers/temp-fixture';
import * as dotnet from '../lib/nuget-parser/cli/dotnet';

describe('when generating a dependency graph', () => {
  const projectDirs: Record<string, string> = {};

  let tempDir: string;
  beforeEach(async () => {
    const fixtures: tempFixture.File[] = [
      {
        name: 'program.cs',
        contents: `
using System;
class TestFixture {
    static public void Main(String[] args)
    {
      var client = new System.Net.Http.HttpClient();
      Console.WriteLine("Hello, World!");
    }
}
`,
      },
      {
        name: 'dotnet_6.csproj',
        contents: `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="NSubstitute" Version="4.3.0" />
  </ItemGroup>
</Project>
`,
      },
    ];
    tempDir = tempFixture.setup(fixtures);

    await dotnet.restore(tempDir);
  });

  afterEach(() => {
    tempFixture.tearDown(Object.values(projectDirs));
  });

  it('generates a correct dependency graph compared to the existing depTree logic', async () => {
    // First generate the graph normally as we did before the new functionality, with depTrees and no runtime support.
    const depTree = await nugetParser.buildDepTreeFromFiles(
      tempDir,
      'obj/project.assets.json',
      undefined,
      ManifestType.DOTNET_CORE,
      false,
    );
    expect(depTree).toBeDefined();
    const baseline = await depGraphLib.legacy.depTreeToGraph(depTree, 'nuget');

    // Then do the same with the new functionality and validate the graph looks the same,
    // only with newer versions for the runtime-specific dependencies. The rest should be identical.
    const withRuntimeDeps = await nugetParser.buildDepGraphFromFiles(
      tempDir,
      'obj/project.assets.json',
      ManifestType.DOTNET_CORE,
      false
    );
    expect(withRuntimeDeps.dependencyGraph).toBeDefined();

    // Assert that the existing logic shows an older version of a runtime dependency:
    expect(baseline).toBeDefined();
    let pkg: depGraphLib.Pkg = {
      name: 'System.Net.Http',
      version: '4.3.0',
    };
    expect(baseline.getPkgs()).toContainEqual(pkg);
    const baselinePathsToRoot = baseline
      .pkgPathsToRoot(pkg)
      .map((inner) => inner.map(({ name }) => ({ name })));

    // Assert that with runtime deps it correctly reflects the net6.0 runtime version of the same package:
    expect(withRuntimeDeps.dependencyGraph).toBeDefined();
    pkg = {
      name: 'System.Net.Http',
      version: '6.0.0',
    };
    expect(withRuntimeDeps.dependencyGraph.getPkgs()).toContainEqual(pkg);
    const withRuntimeDepsPathsToRoot = withRuntimeDeps.dependencyGraph
      .pkgPathsToRoot(pkg)
      .map((inner) => inner.map(({ name }) => ({ name })));

    // Assert that no construction of the depGraph otherwise was destroyed in the process.
    // The depTree will not be completely identical to the depGraph, so we cannot compare one-to-one. For instance,
    // we've gotten rid of the 'freqDeps' among other things.
    // Instead, we can validate that the transitive line still holds.
    // Expected: NSubstitute -> Castle.Core -> NETStandard.Library -> System.Net.Http
    expect(baselinePathsToRoot).toEqual(withRuntimeDepsPathsToRoot);
  });
});
