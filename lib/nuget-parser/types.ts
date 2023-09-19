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

// <System.Net.Http, 6.0.0, ...>
export type AssemblyVersions = Record<string, string>;

// <osx-arm64, [<System.Net.Http, 6.0.0>, ...]>
export type RuntimeAssemblyVersions = Record<string, AssemblyVersions>;
