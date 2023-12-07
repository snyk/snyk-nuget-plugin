import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import * as depGraphLib from '@snyk/dep-graph';
import * as nugetParser from '../lib/nuget-parser';
import * as types from '../lib/nuget-parser/types';
import { ManifestType } from '../lib/nuget-parser/types';
import * as codeGenerator from '../lib/nuget-parser/csharp/generator';
import * as dotnet from '../lib/nuget-parser/cli/dotnet';

describe('when generating a dependency graph', () => {
  const projectDirs: Record<string, string> = {};

  beforeAll(async () => {});

  afterAll(() => {
    codeGenerator.tearDown(Object.values(projectDirs));
  });

  it('generates a correct dependency graph compared to the existing depTree logic', async () => {
    // Generate some random project
    const files: types.DotNetFile[] = [
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
<Project Sdk='Microsoft.NET.Sdk'>
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include='NSubstitute' Version='4.3.0' />
  </ItemGroup>
</Project>
`,
      },
    ];
    const fixtureName = 'dotnet6';
    projectDirs[fixtureName] = codeGenerator.generate('fixtures', files);
    const tempDir = projectDirs[fixtureName];
    await dotnet.restore(tempDir);

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
    const withRuntimeDepsResults = await nugetParser.buildDepGraphFromFiles(
      tempDir,
      'obj/project.assets.json',
      ManifestType.DOTNET_CORE,
      false,
    );

    expect(withRuntimeDepsResults.length).toEqual(1);

    const withRuntimeDeps = withRuntimeDepsResults[0];
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

  it('does not crash when parsing a project with no dependencies', async () => {
    // Generate some random project
    const files: types.DotNetFile[] = [
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
        name: 'no_deps.csproj',
        contents: `
<Project Sdk='Microsoft.NET.Sdk'>
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>
</Project>
`,
      },
    ];
    const fixtureName = 'noDeps';
    projectDirs[fixtureName] = codeGenerator.generate('fixtures', files);
    const tempDir = projectDirs[fixtureName];
    await dotnet.restore(tempDir);

    const results = await nugetParser.buildDepGraphFromFiles(
      tempDir,
      'obj/project.assets.json',
      ManifestType.DOTNET_CORE,
      false,
    );
    expect(results.length).toEqual(1);
    expect(results[0].dependencyGraph).toBeDefined();
  });

  it('correctly understands package overrides with central package management', async () => {
    const files: types.DotNetFile[] = [
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
        name: 'package_override.csproj',
        contents: `
<Project Sdk='Microsoft.NET.Sdk'>
  <PropertyGroup>
    <TargetFramework>net7.0</TargetFramework>
    <OutputType>Exe</OutputType>
    <AssemblyName>LoadSimulator</AssemblyName>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include='Microsoft.Data.SqlClient' />
  </ItemGroup>
</Project>
`,
      },
      {
        name: 'Directory.Packages.props',
        contents: `
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
    <CentralPackageTransitivePinningEnabled>true</CentralPackageTransitivePinningEnabled>
  </PropertyGroup>
  <ItemGroup>
    <!-- Should pick up this version that Data.SqlClient is depending on, but bump it to the version below in the depGraph. -->
    <PackageVersion Include='Azure.Identity' Version='[1.10.4]' />
  </ItemGroup>
  <ItemGroup>
    <PackageVersion Include='Microsoft.Data.SqlClient' Version='[5.1.2]' />
  </ItemGroup>
</Project>
`,
      },
    ];
    const fixtureName = 'packageOverride';
    projectDirs[fixtureName] = codeGenerator.generate('fixtures', files);
    const tempDir = projectDirs[fixtureName];
    await dotnet.restore(tempDir);

    const results = await nugetParser.buildDepGraphFromFiles(
      tempDir,
      'obj/project.assets.json',
      ManifestType.DOTNET_CORE,
      false,
    );
    expect(results.length).toEqual(1);

    const depGraph = results[0].dependencyGraph;

    // Assert that the normal transitive dependency is not found in the graph
    let pkg: depGraphLib.Pkg = {
      name: 'Azure.Identity',
      version: '1.7.0',
    };
    expect(depGraph.getPkgs()).not.toContainEqual(pkg);

    // ... and instead the overwritten one is
    pkg = {
      name: 'Azure.Identity',
      version: '1.10.4',
    };
    expect(depGraph.getPkgs()).toContainEqual(pkg);
  });

  it('extracts and uses a framework targetAlias if detected', async () => {
    const files: types.DotNetFile[] = [
      {
        name: 'program.cs',
        contents: `
using System;

class TestFixture {
    static public void Main(String[] args)
    {
      Console.WriteLine("Hello, World!");
    }
}
`,
      },
      {
        name: 'withAlias.csproj',
        contents: `
<Project Sdk='Microsoft.NET.Sdk'>
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <!-- Writes the targetFramework name as net7.0-windows7.0 in the assets file, which the rest of the ecosystem
     doesn't understand. The generated assets file will name the targetAlias net7.0-windows, which we should pick up. -->
    <TargetFramework>net7.0-windows</TargetFramework>
  </PropertyGroup>
</Project>
`,
      },
    ];
    const fixtureName = 'withTargetAlias';
    projectDirs[fixtureName] = codeGenerator.generate('fixtures', files);
    const tempDir = projectDirs[fixtureName];
    await dotnet.restore(tempDir);

    const results = await nugetParser.buildDepGraphFromFiles(
      tempDir,
      'obj/project.assets.json',
      ManifestType.DOTNET_CORE,
      false,
    );
    expect(results.length).toEqual(1);
    expect(results[0].targetFramework).toEqual('net7.0-windows');
  });
});
