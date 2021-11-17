import { Dependency } from './dependency';

export interface TargetFramework {
  framework: string;
  original: string;
  version: string;
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
