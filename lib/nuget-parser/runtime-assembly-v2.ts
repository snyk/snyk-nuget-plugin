import { CliCommandError } from '../errors';
import * as dotnet from './cli/dotnet';

type SdkInfo = {
  sdkVersion: string;
  sdkPath: string;
};

export const PACKAGE_OVERRIDES_FILE = 'data/PackageOverrides.txt';
export const PACKS_PATH = '/packs/Microsoft.NETCore.App.Ref/';

// Meta-packages that SDK 11's PackageOverrides.txt lists so the SDK can prune them. The
// shared framework ships no assembly for them, so they must not take the runtime's version:
// that would report versions that don't exist, such as NETStandard.Library@8.0.0.
const NON_ASSEMBLY_PACKAGES = new Set(
  [
    'NETStandard.Library',
    'Microsoft.NETCore.App',
    'Microsoft.NETCore.Jit',
    'Microsoft.NETCore.Platforms',
    'Microsoft.NETCore.Runtime.CoreCLR',
    'Microsoft.NETCore.Targets',
    'Microsoft.NETCore.Windows.ApiSets',
  ].map((name) => name.toLowerCase()),
);

export function parsePackageOverrides(
  overridesText: string,
): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const line of overridesText.split('\n')) {
    if (!line) {
      continue;
    }
    const [name, version] = line.split('|');
    if (NON_ASSEMBLY_PACKAGES.has(name.toLowerCase())) {
      continue;
    }
    // Trim any carriage return
    overrides[name] = version.trim();
  }
  return overrides;
}

export function parseSdkInfoFromDotnetOutput(infoOutput: string): SdkInfo {
  const regex =
    /Version:\s*(\d+)\.[\d.]+.*?\.NET SDKs installed:\s*([\s\S]*?)(?:\n\s*\1\.([\d.]+)\s+\[([^\]]*)\])/s;
  const match = infoOutput.match(regex);

  if (!match) {
    throw new CliCommandError(
      `Could not fetch details about the dotnet SDK. Cannot continue without it.
      Dotnet info output: ${infoOutput}`,
    );
  }

  return { sdkVersion: `${match[1]}.${match[3]}`, sdkPath: match[4] };
}

// Relying on dotnet to fetch the right version that the project will use.
// Details: https://learn.microsoft.com/en-us/dotnet/core/versions/selection#the-sdk-uses-the-latest-installed-version
// And here: https://learn.microsoft.com/en-us/dotnet/core/tools/global-json#matching-rules
export async function extractSdkInfo(projectPath: string): Promise<SdkInfo> {
  const infoOutput = await dotnet.execute(['--info'], projectPath);
  return parseSdkInfoFromDotnetOutput(infoOutput);
}

export function findLatestMatchingVersion(
  input: string,
  sdkVersion: string,
): string {
  const majorSdkVersion = sdkVersion.split('.')[0];
  const regex = new RegExp(
    `Microsoft\\.NETCore\\.App ${majorSdkVersion}\\.(\\d+\\.\\d+) \\[`,
    'g',
  );
  let lastMatchVersion: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    lastMatchVersion = `${majorSdkVersion}.${match[1]}`;
  }

  if (!lastMatchVersion) {
    throw new CliCommandError(
      `Could not fetch details about the dotnet runtime. Cannot continue without it.
      Dotnet list-runtimes output: ${input}`,
    );
  }

  return lastMatchVersion;
}
