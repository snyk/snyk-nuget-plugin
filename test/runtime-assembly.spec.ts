import { describe, expect, it } from '@jest/globals';
import * as runtimeAssembly from '../lib/nuget-parser/runtime-assembly';
import * as tempFixture from './helpers/temp-fixture';
import * as dotnet from '../lib/nuget-parser/cli/dotnet';
import * as path from 'path';

// Include some random C# code that will make `dotnet publish` happy.
const program: tempFixture.File = {
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
      targetFramework: '',
      expected: false,
    },
    {
      targetFramework: 'foobar',
      expected: false,
    },
    // Windows Store
    {
      targetFramework: 'netcore45',
      expected: false,
    },
    // .NET Standard
    {
      targetFramework: 'netstandard1.5',
      expected: true,
    },
    // .NET Core
    {
      targetFramework: 'netcoreapp3.1',
      expected: true,
    },
    // .NET >= 5
    {
      targetFramework: 'net7.0',
      expected: true,
    },
    // .NET Framework < 5
    {
      targetFramework: 'net403',
      expected: false,
    },
    // .NET Framework < 5
    {
      targetFramework: 'net48',
      expected: false,
    },
  ])(
    'accepts or rejects specific target frameworks for runtime assembly parsing when targetFramework is: $targetFramework.original',
    ({ targetFramework, expected }) => {
      expect(runtimeAssembly.isSupported(targetFramework)).toEqual(expected);
    },
  );

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
      expected: {
        'Microsoft.CSharp.dll': '6.0.0',
      },
    },
    {
      description: 'a dotnet standard 2.1 project',
      project: {
        name: 'dotnetstandard21.csproj',
        contents: `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>netstandard2.1</TargetFramework>
    <RootNamespace>Microsoft.eShopWeb.ApplicationCore</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="System.Text.Json" Version="4.7.2" />
  </ItemGroup>
</Project>
`,
      },
      expected: {
        'System.Threading.Tasks.Extensions.dll': '4.2.0',
      },
    },
  ])(
    'correctly matches the assembly versions of system dependencies: $description',
    async ({ project, expected }) => {
      // Generate and publish a dotnet project on the fly
      const files: tempFixture.File[] = [program, project];
      const tempDir = tempFixture.setup(files);
      const publishDir = await dotnet.publish(tempDir);

      // Find the project_name.deps.json from the /bin folder
      const projectName = path.parse(project.name).name;
      const assetsFile = path.resolve(publishDir, `${projectName}.deps.json`);

      const runtimeAssemblies =
        runtimeAssembly.generateRuntimeAssemblies(assetsFile);

      expect(runtimeAssemblies).toMatchObject(expected);

      // Try your best to clean up. Avoiding the `afterEach` to not have too many global variables.
      tempFixture.tearDown([tempDir]);
    },
  );
});
