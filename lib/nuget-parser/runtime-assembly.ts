import { AssemblyVersions, PublishedProjectDeps } from './types';
import { FileNotProcessableError, CliCommandError } from '../errors/';
import * as debugModule from 'debug';
import * as dotnet from './cli/dotnet';
import * as fs from 'fs';

const debug = debugModule('snyk');

type SdkInfo = {
  sdkVersion: string;
  sdkPath: string;
};

const DOTNET_DEPS_JSON = 'dotnet.deps.json';
const PACKAGE_OVERRIDES_FILE = 'data/PackageOverrides.txt';
const PACKS_PATH = '/packs/Microsoft.NETCore.App.Ref/';

// Relying on dotnet to fetch the right version that the project will use.
// Details: https://learn.microsoft.com/en-us/dotnet/core/versions/selection#the-sdk-uses-the-latest-installed-version
// And here: https://learn.microsoft.com/en-us/dotnet/core/tools/global-json#matching-rules
async function extractSdkInfo(projectPath: string): Promise<SdkInfo> {
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

function findLatestMatchingVersion(input: string, sdkVersion: string): string {
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

// The Nuget dependency resolution rule of lowest applicable version
// (see https://learn.microsoft.com/en-us/nuget/concepts/dependency-resolution#lowest-applicable-version)
// does not apply to runtime dependencies. If you resolve a dependency graph of some package, that depends on
// System.Http.Net 4.0.0, you might still very well end up using System.Http.Net 7.0.0 if you are running your
// executable on .net7.0.
// The libraries and package overrides defined in the current sdk will give a good estimate of what runtime dependencies are going to be used,
// so we inspect that for information.
// See https://natemcmaster.com/blog/2017/12/21/netcore-primitives/ for a good overview.
// And https://github.com/dotnet/sdk/blob/main/documentation/specs/runtime-configuration-file.md for the official
// explanation of what the `deps.json` file is doing that we are traversing.
export async function generateRuntimeAssemblies(
  projectPath: string,
): Promise<AssemblyVersions> {
  debug(`Extracting runtime assemblies`);

  const runtimeAssemblyVersions: AssemblyVersions = {};

  const { sdkVersion, sdkPath } = await extractSdkInfo(projectPath);
  try {
    const sdkDataPath = `${sdkPath}/${sdkVersion}/${DOTNET_DEPS_JSON}`;
    const sdkData = fs.readFileSync(sdkDataPath, 'utf-8');
    const assemblies: PublishedProjectDeps = JSON.parse(sdkData);

    for (const [assemblyName, value] of Object.entries(assemblies.libraries)) {
      // We're only insterested in packages that are part of the NuGet Gallery
      // https://github.com/dotnet/sdk/blob/main/documentation/specs/runtime-configuration-file.md#libraries-section-depsjson
      if (value.serviceable && value.sha512) {
        const [name, version] = assemblyName.split('/');
        runtimeAssemblyVersions[name] = version;
      }
    }
  } catch (err) {
    throw new FileNotProcessableError(
      `Failed to process dotnet.deps.json, error: ${err}`,
    );
  }

  const localRuntimes = await dotnet.execute(['--list-runtimes'], projectPath);
  const runtimeVersion = findLatestMatchingVersion(localRuntimes, sdkVersion);

  try {
    const overridesPath: string = `${sdkPath.slice(0, sdkPath.lastIndexOf('/'))}${PACKS_PATH}${runtimeVersion}/${PACKAGE_OVERRIDES_FILE}`;
    const overridesAssemblies: string = fs.readFileSync(overridesPath, 'utf-8');
    for (const pkg of overridesAssemblies.split('\n')) {
      if (pkg) {
        const [name, version] = pkg.split('|');
        // Trim any carriage return
        runtimeAssemblyVersions[name] = version.trim();
      }
    }
  } catch (err) {
    throw new FileNotProcessableError(
      `Failed to read PackageOverrides.txt, error: ${err}`,
    );
  }

  if (Object.keys(runtimeAssemblyVersions).length === 0) {
    throw new FileNotProcessableError(
      'Runtime assembly versions collection is empty',
    );
  }

  debug(`Finished extracting runtime assemblies`);
  return runtimeAssemblyVersions;
}
