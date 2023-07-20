import { describe, expect, it } from '@jest/globals';
import * as depGraphLib from '@snyk/dep-graph';
import * as nugetParser from '../lib/nuget-parser';
import { ManifestType } from '../lib/nuget-parser/types';

describe('when generating a dependency graph', () => {
  it('generates a correct dependency graph compared to the existing depTree logic', async () => {
    const depTree = await nugetParser.buildDepTreeFromFiles(
      './test/stubs/dotnet_6',
      'obj/project.assets.json',
      undefined,
      ManifestType.DOTNET_CORE,
      undefined,
    );
    expect(depTree).toBeDefined();
    const depTreeConverted = await depGraphLib.legacy.depTreeToGraph(
      depTree,
      'nuget',
    );

    const result = await nugetParser.buildDepGraphFromFiles(
      './test/stubs/dotnet_6',
      'obj/project.assets.json',
      ManifestType.DOTNET_CORE,
      undefined,
      undefined,
    );
    expect(result.dependencyGraph).toBeDefined();
    const depGraph = result.dependencyGraph;

    // The depTree will not be completely identical to the depGraph, so we cannot compare one-to-one. For instance,
    // we've gotten rid of the 'freqDeps' among other things.
    // Instead, we can validate that the transitive line still holds.
    // Expected: NSubstitute -> Castle.Core -> NETStandard.Library -> System.Net.Http
    const pkg = { name: 'System.Net.Http', version: '4.3.0' };
    const generated = depGraph.pkgPathsToRoot(pkg);
    const baseline = depTreeConverted.pkgPathsToRoot(pkg);
    expect(generated).toEqual(baseline);
  });
});
