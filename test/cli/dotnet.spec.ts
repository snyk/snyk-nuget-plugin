import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import * as dotnet from '../../lib/nuget-parser/cli/dotnet';
import * as tempFixture from '../helpers/temp-fixture';
import * as fs from 'fs';
import { TargetFrameworkInfo } from '../../lib/nuget-parser/types';

describe('when running the dotnet cli command', () => {
  const projectDirs: Record<string, string> = {};
  beforeAll(() => {});

  afterAll(() => {
    tempFixture.tearDown(Object.values(projectDirs));
  });

  it('publishes a dependency file correctly to the published folder', async () => {
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
    <RuntimeIdentifier>linux-x64</RuntimeIdentifier>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="NSubstitute" Version="4.3.0"/>
  </ItemGroup>
</Project>
`,
      },
    ];
    projectDirs['runtimeDepsDiffer'] = tempFixture.setup(fixtures);

    const publishDir = await dotnet.publish(projectDirs['runtimeDepsDiffer']);
    const contents = fs.readdirSync(publishDir);
    expect(contents).toContain('dotnet_6.deps.json');
  });

  it('publishes a dependency file correctly to the published folder that has multiple target frameworks', async () => {
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
        name: 'dotnet_6_and_7.csproj',
        contents: `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFrameworks>net6.0;net7.0</TargetFrameworks>
    <RuntimeIdentifier>linux-x64</RuntimeIdentifier>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="NSubstitute" Version="4.3.0"/>
  </ItemGroup>
</Project>
`,
      },
    ];
    projectDirs['multipleTargetFrameworks'] = tempFixture.setup(fixtures);

    const publishDir = await dotnet.publish(
      projectDirs['multipleTargetFrameworks'],
      'net7.0',
    );
    const contents = fs.readdirSync(publishDir);
    expect(contents).toContain('dotnet_6_and_7.deps.json');
  });

  it.each([
    {
      shortName: 'net6.0',
      expected: '.NETCoreApp,Version=v6.0',
    },
    {
      shortName: 'netcore451',
      expected: '.NETCore,Version=v4.5.1',
    },
    {
      shortName: 'wpa8101',
      expected: 'WindowsPhoneApp,Version=v8.1.0.1',
    },
    {
      shortName: 'klaatu barada nikto!!!',
      expected: 'Unsupported,Version=v0.0',
    },
  ])(
    'parses ShortName TFM to LongName using Nuget.Frameworks successfully',
    async ({ shortName, expected }) => {
      const response = await dotnet.run(
        './lib/cs/NugetFrameworks/Parse/Parse.csproj',
        [shortName],
      );

      const targetFrameworkInfo: TargetFrameworkInfo = JSON.parse(response);

      expect(targetFrameworkInfo.ShortName).toEqual(shortName);
      expect(targetFrameworkInfo.DotNetFrameworkName).toEqual(expected);
    },
  );
});
