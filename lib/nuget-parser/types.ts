export interface TargetFramework {
  framework: string;
  original: string;
  version: string;
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

interface Project {
  version: string;
  restore: Record<string, any>;
  frameworks: Record<string, any>;
  runtimeIdentifierGraphPath: string;
}

// .NET core's project.assets.json with the needed fields represented
export interface ProjectAssets {
  version: number;
  targets: Record<string, any>;
  libraries: Record<string, any>;
  projectFileDependencyGroups: Record<string, any>;
  packageFolders: Record<string, any>;
  project: Project;
}

// <System.Net.Http, 6.0.0, ...>
export type AssemblyVersions = Record<string, string>;

// <osx-arm64, [<System.Net.Http, 6.0.0>, ...]>
export type RuntimeAssemblyVersions = Record<string, AssemblyVersions>;
