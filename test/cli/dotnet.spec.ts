import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import * as dotnet from '../../lib/nuget-parser/cli/dotnet';
import * as tempFixture from '../helpers/temp-fixture';
import * as fs from 'fs';

describe('when running the dotnet cli command', () => {
  let tempDir;
  beforeAll(async () => {
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
  });

  afterAll(() => {
    tempFixture.tearDown(tempDir);
  });

  it('publishes correctly to the /bin folder', async () => {
    const publishDir = await dotnet.publish(tempDir);
    const contents = fs.readdirSync(publishDir);
    expect(contents).toContain('dotnet_6.deps.json');
  });
});
