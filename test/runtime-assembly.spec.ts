import { describe, expect, it } from '@jest/globals';
import * as runtimeAssembly from '../lib/nuget-parser/runtime-assembly';
import * as tempFixture from './helpers/temp-fixture';
import * as dotnet from '../lib/nuget-parser/cli/dotnet';
import * as path from "path";

// Include some random C# code that will make `dotnet publish` happy.
const program: tempFixture.File = {
  name: 'program.cs',
  contents: `
using System;
var client = new System.Net.Http.HttpClient();
Console.WriteLine("Hello, World!");
`,
};

describe('when parsing runtime assembly', () => {
  it.each([
    {
      description: 'a dotnet 6.0 project',
      project: {
        name: 'dotnet6.csproj',
        contents: `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net6.0</TargetFramework>
    <RuntimeIdentifier>linux-x64</RuntimeIdentifier>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="NSubstitute" Version="4.3.0"/>
  </ItemGroup>
</Project>
`,
      },
    },
  ])(
    'correctly matches the assembly versions of system dependencies: $description',
    async ({ project }) => {
      // Generate and publish a dotnet project on the fly
      const files: tempFixture.File[] = [program, project];
      const tempDir = tempFixture.setup(files);
      const publishDir = await dotnet.publish(tempDir);
      // Find the project_name.deps.json from the /bin folder
      const projectName = path.parse(project.name).name;
      const assetsFile = path.resolve(publishDir, `${projectName}.deps.json`);

      const runtimeAssemblies =
        runtimeAssembly.generateRuntimeAssemblies(assetsFile);

      expect(runtimeAssemblies).toMatchObject({
        'Microsoft.CSharp.dll': '6.0.0',
      });

      // Try your best to clean up. Avoiding the `afterEach` to not have too many global variables.
      tempFixture.tearDown(tempDir);
    },
  );
});
