import { describe, expect, it } from '@jest/globals';
import * as v3Parser from '../../lib/nuget-parser/parsers/dotnet-core-v3-parser';
import { parse as legacyParse } from '../../lib/nuget-parser/parsers/dotnet-core-parser';
import { ProjectAssets } from '../../lib/nuget-parser/types';

const overrides = { overridesAssemblies: {}, overrideVersion: undefined };

function assets(
  targets: Record<string, unknown>,
  direct: string[],
  libraries: Record<string, unknown> = {},
): ProjectAssets {
  return {
    version: 3,
    project: {
      version: '1.0.0',
      restore: { projectName: 'consumer', projectPath: '/src/consumer.csproj' },
      frameworks: { 'net8.0': {} },
    },
    projectFileDependencyGroups: { 'net8.0': direct },
    targets: { 'net8.0': targets },
    libraries,
  } as unknown as ProjectAssets;
}

function parse(manifest: ProjectAssets) {
  return v3Parser.parse('consumer', 'net8.0', manifest, overrides);
}

function names(graph: ReturnType<typeof parse>): string[] {
  return graph
    .getDepPkgs()
    .map((p) => `${p.name}@${p.version}`)
    .sort();
}

function childrenOf(graph: ReturnType<typeof parse>, nodeId: string) {
  return graph
    .toJSON()
    .graph.nodes.find((n) => n.nodeId === nodeId)!
    .deps.map((d) => d.nodeId)
    .sort();
}

describe('v3 parser with project references', () => {
  const log4net = {
    'log4net/2.0.17': { type: 'package', dependencies: { Leaf: '1.0.0' } },
    'Leaf/1.0.0': { type: 'package' },
  };

  it('leaves out a project named like a public package and keeps its packages', () => {
    const graph = parse(
      assets(
        {
          ...log4net,
          'Communicator/1.0.0': {
            type: 'project',
            dependencies: { log4net: '2.0.17' },
          },
        },
        ['Communicator >= 1.0.0'],
      ),
    );

    expect(names(graph)).toEqual(['Leaf@1.0.0', 'log4net@2.0.17']);
    expect(graph.getPkgs().map((p) => p.name)).not.toContain('Communicator');
    expect(childrenOf(graph, 'root-node')).toEqual(['log4net@2.0.17']);
    expect(childrenOf(graph, 'log4net@2.0.17')).toEqual(['Leaf@1.0.0']);
  });

  it('reads the project type from libraries when the target entry has none', () => {
    const graph = parse(
      assets(
        {
          ...log4net,
          'Communicator/1.0.0': { dependencies: { log4net: '2.0.17' } },
        },
        ['Communicator >= 1.0.0'],
        { 'Communicator/1.0.0': { type: 'project' } },
      ),
    );

    expect(names(graph)).toEqual(['Leaf@1.0.0', 'log4net@2.0.17']);
  });

  it('re-parents through a chain of projects onto the nearest package', () => {
    const graph = parse(
      assets(
        {
          'Pkg/1.0.0': { type: 'package', dependencies: { Inner: '1.0.0' } },
          'Inner/1.0.0': {
            type: 'project',
            dependencies: { Outer: '1.0.0' },
          },
          'Outer/1.0.0': {
            type: 'project',
            dependencies: { log4net: '2.0.17' },
          },
          ...log4net,
        },
        ['Pkg >= 1.0.0'],
      ),
    );

    expect(names(graph)).toEqual(['Leaf@1.0.0', 'Pkg@1.0.0', 'log4net@2.0.17']);
    expect(childrenOf(graph, 'Pkg@1.0.0')).toEqual(['log4net@2.0.17']);
  });

  it('does not duplicate a package that is also referenced directly', () => {
    const targets = {
      ...log4net,
      'Communicator/1.0.0': {
        type: 'project',
        dependencies: { log4net: '2.0.17' },
      },
    };

    for (const direct of [
      ['Communicator >= 1.0.0', 'log4net >= 2.0.17'],
      ['log4net >= 2.0.17', 'Communicator >= 1.0.0'],
    ]) {
      const graph = parse(assets(targets, direct));

      expect(names(graph)).toEqual(['Leaf@1.0.0', 'log4net@2.0.17']);
      expect(childrenOf(graph, 'root-node')).toEqual(['log4net@2.0.17']);
    }
  });

  it('stops on projects that reference each other', () => {
    const graph = parse(
      assets(
        {
          ...log4net,
          'A/1.0.0': {
            type: 'project',
            dependencies: { B: '1.0.0', log4net: '2.0.17' },
          },
          'B/1.0.0': { type: 'project', dependencies: { A: '1.0.0' } },
        },
        ['A >= 1.0.0'],
      ),
    );

    expect(names(graph)).toEqual(['Leaf@1.0.0', 'log4net@2.0.17']);
  });

  it('gives a project with no dependencies an empty graph', () => {
    const graph = parse(
      assets({ 'Communicator/1.0.0': { type: 'project' } }, [
        'Communicator >= 1.0.0',
      ]),
    );

    expect(names(graph)).toEqual([]);
    expect(graph.rootPkg).toEqual({ name: 'consumer', version: '1.0.0' });
  });

  it('keeps ordinary packages untouched', () => {
    const graph = parse(assets(log4net, ['log4net >= 2.0.17']));

    expect(names(graph)).toEqual(['Leaf@1.0.0', 'log4net@2.0.17']);
  });
});

describe('legacy parser with project references', () => {
  it('does not emit a project entry, as direct dependencies list packages only', () => {
    const tree = legacyParse(
      { name: 'consumer', version: '1.0.0', meta: {}, dependencies: {} },
      {
        targets: {
          'net8.0': {
            'log4net/2.0.17': { type: 'package' },
            'Communicator/1.0.0': {
              type: 'project',
              dependencies: { log4net: '2.0.17' },
            },
          },
        },
        project: {
          frameworks: { 'net8.0': { dependencies: { log4net: {} } } },
        },
      },
    );

    expect(Object.keys(tree.dependencies)).toEqual(['log4net']);
  });
});
