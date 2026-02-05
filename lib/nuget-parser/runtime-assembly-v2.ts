import { CliCommandError } from '../errors';
import * as dotnet from './cli/dotnet';

type SdkInfo = {
  sdkVersion: string;
  sdkPath: string;
};

export const PACKAGE_OVERRIDES_FILE = 'data/PackageOverrides.txt';
export const PACKS_PATH = '/packs/Microsoft.NETCore.App.Ref/';

// Relying on dotnet to fetch the right version that the project will use.
// Details: https://learn.microsoft.com/en-us/dotnet/core/versions/selection#the-sdk-uses-the-latest-installed-version
// And here: https://learn.microsoft.com/en-us/dotnet/core/tools/global-json#matching-rules
export async function extractSdkInfo(projectPath: string): Promise<SdkInfo> {
  const infoOutput = await dotnet.execute(['--info'], projectPath);
  const regex =
    /Version:\s*([\d.]+).*?\.NET SDKs installed:\s*([\s\S]*?)(?:\n\s*\1\s+\[(.*?)\])/s;
  const match = infoOutput.match(regex);

  if (!match) {
    throw new CliCommandError(
      `Could not fetch details about the dotnet SDK. Cannot continue without it.
      Dotnet info output: ${infoOutput}`,
    );
  }

  return { sdkVersion: match[1], sdkPath: match[3] };
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
