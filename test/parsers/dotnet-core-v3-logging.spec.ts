import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import debugModule from 'debug';
import * as v3Parser from '../../lib/nuget-parser/parsers/dotnet-core-v3-parser';
import { ProjectAssets } from '../../lib/nuget-parser/types';

// The v3 builder used to log every edge it walked. Under -d that was tens of thousands of
// lines per project, and on CI agents piping it to a console it cost as much as the scan
// (OSM-3889). It now logs a fixed number of lines per graph, whatever the graph's size.
function assets(): ProjectAssets {
  return {
    version: 3,
    project: {
      version: '1.0.0',
      restore: { projectName: 'app', projectPath: '/src/app/app.csproj' },
      frameworks: { 'net8.0': {} },
    },
    projectFileDependencyGroups: {
      'net8.0': ['A >= 1.0.0', 'B >= 1.0.0'],
    },
    targets: {
      'net8.0': {
        'A/1.0.0': {
          dependencies: { Shared: '1.0.0', 'runtime.native.X': '1.0.0' },
        },
        'B/1.0.0': { dependencies: { Shared: '1.0.0', Missing: '1.0.0' } },
        // Declared as 1.0.0 by A and B, resolved to 2.0.0.
        'Shared/2.0.0': { dependencies: { Leaf: '1.0.0' } },
        'Leaf/1.0.0': {},
      },
    },
  } as unknown as ProjectAssets;
}

describe('v3 dep graph debug logging', () => {
  const lines: string[] = [];
  const originalLog = debugModule.log;
  const originalNamespaces = debugModule.disable();

  beforeEach(() => {
    lines.length = 0;
    debugModule.enable('snyk');
    debugModule.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    debugModule.log = originalLog;
    debugModule.enable(originalNamespaces);
  });

  it('logs one summary per graph instead of one line per edge', () => {
    const graph = v3Parser.parse('app', 'net8.0', assets(), {
      overridesAssemblies: {},
      overrideVersion: undefined,
    });

    // The graph itself is unchanged: Shared is walked under both A and B.
    expect(
      graph
        .getPkgs()
        .map((p) => `${p.name}@${p.version}`)
        .sort(),
    ).toEqual([
      'A@1.0.0',
      'B@1.0.0',
      'Leaf@1.0.0',
      'Shared@2.0.0',
      'app@1.0.0',
    ]);

    expect(lines.filter((l) => l.includes('Adding dependency'))).toEqual([]);
    expect(lines.filter((l) => l.includes('Pruning duplicate'))).toEqual([]);

    const summaries = lines.filter((l) => l.includes('Built net8.0 dep graph'));
    expect(summaries).toHaveLength(1);
    const summary = summaries[0];
    // A, B, then Shared and Leaf under each of them.
    expect(summary).toContain('6 dependencies added, 0 pruned');
    expect(summary).toContain('Ignored by prefix: runtime.native.X');
    expect(summary).toContain('Not in lock file: Missing');
    expect(summary).toContain(
      'Version mismatches: Shared (declared 1.0.0, resolved 2.0.0)',
    );

    // Direct dependencies line, "Trying to parse" line, and the summary.
    expect(lines.length).toBeLessThanOrEqual(4);
  });
});
