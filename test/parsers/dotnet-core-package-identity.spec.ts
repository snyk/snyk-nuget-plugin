import { describe, expect, it } from '@jest/globals';
import { legacy } from '@snyk/dep-graph';
import { parse } from '../../lib/nuget-parser/parsers/dotnet-core-parser';

function manifestFor(targets, dependencies) {
  return {
    targets: { 'net8.0': targets },
    project: { frameworks: { 'net8.0': { dependencies } } },
  };
}

function emptyTree() {
  return { name: 'root', version: '1.0.0', meta: {}, dependencies: {} };
}

describe('static .NET Core package identity', () => {
  it.each([
    {
      scenario: 'matching casing',
      installed: 'log4net',
      direct: 'log4net',
      transitive: 'log4net',
      separator: '/',
    },
    {
      scenario: 'mixed direct and transitive references',
      installed: 'log4net',
      direct: 'log4net',
      transitive: 'Log4Net',
      separator: '/',
    },
    {
      scenario: 'both references differ from the installed casing',
      installed: 'Log4Net',
      direct: 'log4net',
      transitive: 'LOG4NET',
      separator: '/',
    },
    {
      scenario: 'Windows target keys',
      installed: 'log4net',
      direct: 'LOG4NET',
      transitive: 'Log4Net',
      separator: '\\',
    },
  ])(
    'uses one installed identity for $scenario',
    async ({ installed, direct, transitive, separator }) => {
      const manifest = manifestFor(
        {
          [`${installed}${separator}2.0.17`]: { type: 'package' },
          [`Parent${separator}1.0.0`]: {
            type: 'package',
            dependencies: { [transitive]: '2.0.0' },
          },
        },
        { [direct]: { version: '[2.0.0, )' }, Parent: { version: '1.0.0' } },
      );

      const tree = parse(emptyTree(), manifest);
      const graph = await legacy.depTreeToGraph(tree, 'nuget');

      expect(Object.keys(tree.dependencies).sort()).toEqual(
        [installed, 'Parent'].sort(),
      );
      expect(tree.dependencies[installed]).toEqual({
        name: installed,
        version: '2.0.17',
        dependencies: {},
      });
      expect(tree.dependencies.Parent.dependencies).toEqual({
        [installed]: tree.dependencies[installed],
      });
      expect(graph.getDepPkgs()).toHaveLength(2);
      expect(
        graph.pkgPathsToRoot({ name: installed, version: '2.0.17' }),
      ).toHaveLength(2);
    },
  );

  it('preserves a cycle through a differently cased reference', () => {
    const manifest = manifestFor(
      {
        'Parent/1.0.0': { dependencies: { child: '2.0.0' } },
        'Child/2.0.0': { dependencies: { PARENT: '1.0.0' } },
      },
      { parent: { version: '1.0.0' } },
    );

    const tree = parse(emptyTree(), manifest);

    expect(Object.keys(tree.dependencies)).toEqual(['Parent']);
    const parent = tree.dependencies.Parent;
    expect(Object.keys(parent.dependencies)).toEqual(['Child']);
    const child = parent.dependencies.Child;
    expect(child).toMatchObject({ name: 'Child', version: '2.0.0' });
    expect(Object.keys(child.dependencies)).toEqual(['Parent']);
    expect(child.dependencies.Parent.name).toBe('Parent');
    expect(child.dependencies.Parent.dependencies).toBe(parent.dependencies);
  });

  it.each(['System.Runtime', 'system.runtime'])(
    'groups the installed frequent dependency %s despite reference casing',
    (installed) => {
      const manifest = manifestFor(
        {
          'Parent/1.0.0': { dependencies: { 'SYSTEM.RUNTIME': '4.3.0' } },
          [`${installed}/4.3.1`]: {},
        },
        { Parent: { version: '1.0.0' } },
      );

      const tree = parse(emptyTree(), manifest);

      expect(Object.keys(tree.dependencies).sort()).toEqual([
        'Parent',
        'freqSystemDependencies',
      ]);
      expect(tree.dependencies.Parent.dependencies).toEqual({});
      expect(tree.dependencies.freqSystemDependencies.dependencies).toEqual({
        [installed]: {
          name: installed,
          version: '4.3.1',
          dependencies: {},
        },
      });
    },
  );
});
