import * as depGraphLib from '@snyk/dep-graph';

export interface TargetFramework {
  framework: string;
  original: string;
  version: string;
}

// The actual TargetFramework representation from Nuget.
// Will going forward replace the `TargetFramework` model defined above, once all V1 logic has been phased out.
export interface TargetFrameworkInfo {
  Framework: string;
  Version: string;
  Platform: string;
  PlatformVersion: string;
  HasPlatform: boolean;
  HasProfile: boolean;
  Profile: string;
  DotNetFrameworkName: string;
  DotNetPlatformName: string;
  IsPCL: boolean;
  IsPackageBased: boolean;
  AllFrameworkVersions: boolean;
  IsUnsupported: boolean;
  IsAgnostic: boolean;
  IsAny: boolean;
  IsSpecificFramework: boolean;
  // Not a part of the actual API, but added for easy access when tossed around in the build graph logic
  // See: https://github.com/NuGet/NuGet.Client/blob/08e07ea13985fb259b35b9ce90fd99339f0fdef2/src/NuGet.Core/NuGet.Frameworks/NuGetFramework.cs#L161
  ShortName: string;
}

export interface Dependency {
  name: string;
  version: string;
  dependencies?: any;
}

export interface DependencyInfo {
  name: string;
  path: string;
  version: string;
}

export interface DependencyTree {
  name: string;
  children: Dependency[];
}

export enum ManifestType {
  PROJECT_JSON = 'project.json',
  DOTNET_CORE = 'dotnet-core',
  PACKAGES_CONFIG = 'packages.config',
  PAKET = 'paket',
}

interface Restore {
  projectUniqueName: string;
  projectName: string;
  projectPath: string;
  packagesPath: string;
  outputPath: string;
  projectStyle: string;
  configFilePaths: string[];
  originalTargetFrameworks: string[];
}

interface Project {
  version: string;
  restore: Restore;
  frameworks: Record<string, any>;
  runtimeIdentifierGraphPath: string;
}

export interface Target {
  type: string;
  dependencies: Record<string, string>;
}

// .NET core's project.assets.json with the needed fields represented
export interface ProjectAssets {
  version: number;
  targets: Record<string, Record<string, Target>>;
  libraries: Record<string, any>;
  projectFileDependencyGroups: Record<string, string[]>;
  packageFolders: Record<string, any>;
  project: Project;
}

// .NET core's published project.deps.json
export interface PublishedProjectDeps {
  runtimeTarget: Record<string, any>;
  targets: Record<string, any>;
  libraries: Record<string, any>;
}

// <System.Net.Http, 6.0.0, ...>
export type AssemblyVersions = Record<string, string>;

// Generate .NET files
export interface DotNetFile {
  name: string;
  contents: string;
}

// V2 dependency graph result
export interface DotnetCoreV2Result {
  dependencyGraph: depGraphLib.DepGraph;
  targetFramework: string | undefined;
}

export type Overrides = {
  overridesAssemblies: AssemblyVersions;
  overrideVersion: string;
};

export type DotnetCoreV2Results = DotnetCoreV2Result[];
