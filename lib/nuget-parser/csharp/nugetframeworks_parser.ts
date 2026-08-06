import * as path from 'path';
import * as fs from 'fs';
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

// The bundled `nupkgs` folder normally lives on disk next to this module. But when this
// plugin runs inside the Snyk CLI's packaged binary, `pkg` mounts everything under `dist`
// into a virtual snapshot filesystem, so `path.join(__dirname, 'nupkgs')` resolves to a
// snapshot-only path (e.g. `/snapshot/...`) that only the packaged Node process itself can
// read. `dotnet restore` runs as a separate OS process and can't see into that snapshot at
// all, so instead of pointing nuget.config there directly, we copy the offline packages
// into the same real, on-disk directory generator.generate() already created below for
// Parse.csproj/Program.cs, and point nuget.config at that.
function writeOfflinePackagesInto(tempDir: string): void {
  const nugetConfigPath = path.join(tempDir, 'nuget.config');
  if (fs.existsSync(nugetConfigPath)) {
    // Already populated by a previous call that hit generator.generate()'s content cache
    // and got back this same tempDir.
    return;
  }

  const bundledNupkgsDir = path.join(__dirname, 'nupkgs');
  fs.mkdirSync(path.join(tempDir, 'nupkgs'));
  for (const fileName of fs.readdirSync(bundledNupkgsDir)) {
    fs.writeFileSync(
      path.join(tempDir, 'nupkgs', fileName),
      fs.readFileSync(path.join(bundledNupkgsDir, fileName)),
    );
  }

  fs.writeFileSync(
    nugetConfigPath,
    `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="snyk-nuget-plugin-offline" value="${xmlAttributeEscape(tempDir)}/nupkgs" />
  </packageSources>
</configuration>
`,
  );
}

export function generate(sdkVersion: string): string {
  const targetFramework = targetFrameworkFromSdkVersion(sdkVersion);

  const files: types.DotNetFile[] = [
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

  const tempDir = generator.generate('csharp', files);
  writeOfflinePackagesInto(tempDir);
  return tempDir;
}
