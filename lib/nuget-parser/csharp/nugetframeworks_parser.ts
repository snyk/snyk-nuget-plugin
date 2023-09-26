import * as debugModule from 'debug';
import * as types from '../types';
import * as generator from './generator';

const debug = debugModule('snyk');

export function generate(): string {
  const files: types.DotNetFile[] = [
    {
      name: 'Parse.csproj',
      contents: `
<Project Sdk='Microsoft.NET.Sdk'>
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net7.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <RootNamespace>ShortNameToLongName</RootNamespace>
    <GenerateRuntimeConfigurationFiles>true</GenerateRuntimeConfigurationFiles>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include='Newtonsoft.Json' Version='13.0.3' />
    <PackageReference Include='NuGet.Frameworks' Version='6.7.0' />
  </ItemGroup>
</Project>
`,
    },
    {
      name: 'Program.cs',
      contents: `
using NuGet.Frameworks;
using Newtonsoft.Json;

namespace ShortNameToLongName;

class Program
{
    static void Main(string[] args)
    {
        if (args.Length < 1)
        {
            Console.WriteLine("Usage: dotnet run <shortTargetFramework>");
            return;
        }

        string shortName = args[0];

        try
        {
            NuGetFramework framework = NuGetFramework.Parse(shortName);
            string json = JsonConvert.SerializeObject(new
            {
                framework.Framework,
                framework.Version,
                framework.Platform,
                framework.PlatformVersion,
                framework.HasPlatform,
                framework.HasProfile,
                framework.Profile,
                framework.DotNetFrameworkName,
                framework.DotNetPlatformName,
                framework.IsPCL,
                framework.IsPackageBased,
                framework.AllFrameworkVersions,
                framework.IsUnsupported,
                framework.IsAgnostic,
                framework.IsAny,
                framework.IsSpecificFramework,
                ShortName = shortName
            }, Formatting.None);
            Console.Write(json);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
        }
    }
}
`,
    },
  ];

  const tempDir = generator.generate('csharp', files);
  debug(`Generated temporary CS files in ${tempDir}`);
  return tempDir;
}
