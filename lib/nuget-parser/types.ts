import { Dependency } from './dependency';
import * as depGraphLib from '@snyk/dep-graph';

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

export interface BaseInspectionResultInfo {
  name: string;
  targetFile: string;
  targetRuntime: string | undefined;
}

export interface InspectResult {
  plugin: BaseInspectionResultInfo;

  // Package is a depTree, but we have no type for it. Since it's deprecated, we're not
  // going to spend time on it.
  package: any;
  // Further, since the default is package, we will append an optional depGraph to the result,
  // instead of polluting the entire codebase with type guards until everything is ported to
  // the depGraph.
  // The CLI logic is "does the result have a .depGraph property or something else?"
  // So we will clear the package element before returning.
  // See https://github.com/snyk/cli/blob/295a14789a0b55d9f1ad71607b8655520566aa09/src/lib/snyk-test/run-test.ts#L785-L801
  // The reason it's dependencyGraph and not depGraph is that the CLI converts it:
  // https://github.com/snyk/cli/blob/d2ea109b145ba0d67e7018276fbb9e3440aa42eb/src/lib/plugins/convert-single-splugin-res-to-multi-custom.ts#L25
  dependencyGraph?: depGraphLib.DepGraph;
}
