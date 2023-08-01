import { describe, expect, it } from '@jest/globals';
import * as depGraphLib from '@snyk/dep-graph';
import * as nugetParser from '../lib/nuget-parser';
import { ManifestType } from '../lib/nuget-parser/types';
import * as tempFixture from './helpers/temp-fixture';
import * as dotnet from '../lib/nuget-parser/cli/dotnet';

describe('when generating a dependency graph', () => {
  let tempDir: string;
  beforeEach(async () => {
    const fixtures: tempFixture.File[] = [
      {
        name: 'program.cs',
        contents: `
using System;
var client = new System.Net.Http.HttpClient();
Console.WriteLine("Hello, World!");
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
    <PackageReference Include="NSubstitute" Version="4.3.0"/>
  </ItemGroup>
</Project>
`,
      },
    ];
    tempDir = tempFixture.setup(fixtures);

    await dotnet.restore(tempDir);
  });

  afterEach(() => {
    tempFixture.tearDown(tempDir);
  });

  it('generates a correct dependency graph compared to the existing depTree logic', async () => {
    const depTree = await nugetParser.buildDepTreeFromFiles(
        tempDir,
        'obj/project.assets.json',
        undefined,
        ManifestType.DOTNET_CORE,
        undefined,
    );
    expect(depTree).toBeDefined();
    const depTreeConverted = await depGraphLib.legacy.depTreeToGraph(
        depTree,
        'nuget',
    );

    const result = await nugetParser.buildDepGraphFromFiles(
        tempDir,
        'obj/project.assets.json',
        ManifestType.DOTNET_CORE,
        false,
        false,
    );
    expect(result.dependencyGraph).toBeDefined();
    const depGraph = result.dependencyGraph;

    // The depTree will not be completely identical to the depGraph, so we cannot compare one-to-one. For instance,
    // we've gotten rid of the 'freqDeps' among other things.
    // Instead, we can validate that the transitive line still holds.
    // Expected: NSubstitute -> Castle.Core -> NETStandard.Library -> System.Net.Http
    const pkg = { name: 'System.Net.Http', version: '4.3.0' };
    const generated = depGraph.pkgPathsToRoot(pkg);
    const baseline = depTreeConverted.pkgPathsToRoot(pkg);
    expect(generated).toEqual(baseline);
  });
});
