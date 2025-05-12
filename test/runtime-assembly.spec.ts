import { describe, expect, it } from '@jest/globals';
import * as runtimeAssembly from '../lib/nuget-parser/runtime-assembly';
import * as runtimeAssemblyV2 from '../lib/nuget-parser/runtime-assembly-v2';
import * as codeGenerator from '../lib/nuget-parser/csharp/generator';
import * as dotnet from '../lib/nuget-parser/cli/dotnet';
import * as types from '../lib/nuget-parser/types';
import * as path from 'path';
import * as fs from 'fs';

// Include some random C# code that will make `dotnet publish` happy.
const program: types.DotNetFile = {
  name: 'program.cs',
  contents: `
using System;
using System.IO;
class TestFixture {
    static public void Main(String[] args)
    {
      Console.WriteLine("Hello, World!");
    }
}
`,
};

describe('when parsing runtime assembly', () => {
  it.each([
    {
      description: 'a dotnet 7.0 project',
      project: {
        name: 'dotnet7.csproj',
        contents: `
<Project Sdk='Microsoft.NET.Sdk'>
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net7.0</TargetFramework>
    <RuntimeIdentifier>linux-x64</RuntimeIdentifier>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include='NSubstitute' Version='4.3.0'/>
  </ItemGroup>
</Project>
`,
      },
      expected: {
        'Microsoft.CSharp': '4.7.0',
      },
      globalJson: {
        name: 'global.json',
        contents: `{
          "sdk": {
            "version": "7.0.410"
          }
        }`,
      },
    },
    {
      description: 'a dotnet 6.0 project',
      project: {
        name: 'dotnet6.csproj',
        contents: `
<Project Sdk='Microsoft.NET.Sdk'>
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net6.0</TargetFramework>
    <RuntimeIdentifier>linux-x64</RuntimeIdentifier>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include='NSubstitute' Version='4.3.0'/>
  </ItemGroup>
</Project>
`,
      },
      expected: {
        'Microsoft.CSharp': '4.7.0',
      },
      globalJson: {
        name: 'global.json',
        contents: `{
    "sdk": {
      "version": "6.0.428"
    }
  }`,
      },
    },
    {
      description: 'a dotnet 6.0 project with missing runtime identifier',
      project: {
        name: 'dotnet6.csproj',
        contents: `
<Project Sdk='Microsoft.NET.Sdk'>
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include='DeepCloner' Version='0.10.4' />
  </ItemGroup>
</Project>
`,
      },
      expected: {
        'System.Net.Http': '4.3.4',
      },
      globalJson: {
        name: 'global.json',
        contents: `{
          "sdk": {
            "version": "6.0.428"
          }
        }`,
      },
    },
  ])(
    'correctly matches the assembly versions of system dependencies: $description',
    async ({ project, expected, globalJson }) => {
      // Generate and publish a dotnet project on the fly
      const files: types.DotNetFile[] = [program, globalJson, project];
      const tempDir = codeGenerator.generate('fixtures', files);
      const publishDir = await dotnet.publish(tempDir);

      // Find the project_name.deps.json from the /bin folder
      const projectName = path.parse(project.name).name;
      const assetsFile = path.resolve(publishDir, `${projectName}.deps.json`);

      const depsFile = fs.readFileSync(assetsFile);
      const deps = JSON.parse(depsFile.toString('utf-8'));

      const runtimeAssemblies = runtimeAssembly.generateRuntimeAssemblies(deps);

      const runtimeAssembliesV2 =
        await runtimeAssemblyV2.generateRuntimeAssemblies(
          publishDir,
          runtimeAssemblies,
        );

      expect(runtimeAssembliesV2).toMatchObject(expected);

      // Try your best to clean up. Avoiding the `afterEach` to not have too many global variables.
      codeGenerator.tearDown([tempDir]);
    },
  );
});
