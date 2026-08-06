import * as path from 'path';
import * as types from '../types';
import * as generator from './generator';

function targetFrameworkFromSdkVersion(sdkVersion: string): string {
  const major = parseInt(sdkVersion.split('.')[0], 10);
  return `net${major}.0`;
}

// Escape a filesystem path so it can be safely embedded in a double-quoted XML
// attribute value (Windows user paths can legitimately contain '&', etc.).
function xmlAttributeEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generate(sdkVersion: string): string {
  const targetFramework = targetFrameworkFromSdkVersion(sdkVersion);

  // Offline support: we ship the (single, dependency-free) NuGet.Frameworks package
  // alongside this module — in `lib` for tests, and copied into `dist` at build time.
  // A generated nuget.config points `dotnet restore` at this folder as its only source,
  // so projects without internet access can still be scanned.
  const offlinePackagesSource = xmlAttributeEscape(
    path.join(__dirname, 'nupkgs'),
  );

  const files: types.DotNetFile[] = [
    {
      name: 'nuget.config',
      contents: `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="snyk-nuget-plugin-offline" value="${offlinePackagesSource}" />
  </packageSources>
</configuration>
`,
    },
    {
      name: 'Parse.csproj',
      contents: `
<Project Sdk='Microsoft.NET.Sdk'>
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>${targetFramework}</TargetFramework>
    <Nullable>enable</Nullable>
    <RootNamespace>ShortNameToLongName</RootNamespace>
    <GenerateRuntimeConfigurationFiles>true</GenerateRuntimeConfigurationFiles>
    <RollForward>LatestMajor</RollForward>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include='NuGet.Frameworks' Version='6.14.3' />
  </ItemGroup>
</Project>
`,
    },
    {
      name: 'Program.cs',
      contents: `
using System;
using System.Text.Json;
using NuGet.Frameworks;

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
            string json = JsonSerializer.Serialize(new
            {
                framework.Framework,
                Version = framework.Version.ToString(),
                framework.Platform,
                PlatformVersion = framework.PlatformVersion?.ToString(),
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
            });
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

  return generator.generate('csharp', files);
}
