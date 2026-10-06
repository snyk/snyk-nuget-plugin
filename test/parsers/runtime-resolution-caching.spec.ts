import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as plugin from '../../lib';
import * as dotnet from '../../lib/nuget-parser/cli/dotnet';
import * as dotnetCache from '../../lib/nuget-parser/cli/dotnet-cache';
import * as subprocess from '../../lib/nuget-parser/cli/subprocess';
import { legacyPlugin as pluginApi } from '@snyk/cli-interface';

// The runtime resolution flow used to rebuild and re-run its NuGet.Frameworks helper app for
// every project.assets.json, so an --all-projects scan paid several `dotnet` start-ups per
// project (OSM-3983). These tests count the real `dotnet` spawns across consecutive inspect()
// calls, the way the CLI drives the plugin for a multi-project repo.

const MANIFEST = 'obj/project.assets.json';

const FIXTURES = {
  dotnet8: {
    dir: './test/fixtures/dotnetcore/dotnet_8',
    projectFile: 'dotnet_8.csproj',
  },
  dotnet8DifferentName: {
    dir: './test/fixtures/dotnetcore/dotnet_8_different_project_name',
    projectFile: 'dotnet_8_foo.csproj',
  },
  dotnet10: {
    dir: './test/fixtures/dotnetcore/dotnet_10',
    projectFile: 'dotnet_10.csproj',
  },
  dotnet6And7: {
    dir: './test/fixtures/dotnetcore/dotnet_6_and_7',
    projectFile: 'dotnet_6_and_7.csproj',
  },
};

type Fixture = (typeof FIXTURES)[keyof typeof FIXTURES];

async function restoreFixture(fixture: Fixture): Promise<void> {
  const dir = path.resolve(fixture.dir);
  await dotnet.restore(path.join(dir, fixture.projectFile), dir);
}

async function inspect(fixture: Fixture) {
  const result = await plugin.inspect(path.resolve(fixture.dir), MANIFEST, {
    'dotnet-runtime-resolution': true,
  });
  if (!pluginApi.isMultiResult(result)) {
    throw new Error('expected a multiResult response from inspection');
  }
  return result;
}

function expectedGraph(fixture: Fixture) {
  return JSON.parse(
    fs.readFileSync(
      path.resolve(fixture.dir, 'expected_depgraph-v3.json'),
      'utf-8',
    ),
  ).depGraph;
}

describe('runtime resolution dotnet spawn caching', () => {
  let spawns: jest.SpiedFunction<typeof subprocess.execute>;

  // Spawns of `dotnet <first arg>` since the spy was installed.
  function count(firstArg: string): number {
    return spawns.mock.calls.filter(
      ([command, args]: Parameters<typeof subprocess.execute>) =>
        command === 'dotnet' && args[0] === firstArg,
    ).length;
  }

  beforeAll(async () => {
    await restoreFixture(FIXTURES.dotnet8);
    await restoreFixture(FIXTURES.dotnet8DifferentName);
    await restoreFixture(FIXTURES.dotnet10);
  }, 200000);

  beforeEach(() => {
    dotnetCache.reset();
    spawns = jest.spyOn(subprocess, 'execute');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds and runs the helper once for consecutive projects sharing a target framework', async () => {
    const first = await inspect(FIXTURES.dotnet8);
    const second = await inspect(FIXTURES.dotnet8DifferentName);

    expect(count('--version')).toEqual(1);
    expect(count('build')).toEqual(1);
    expect(count('restore')).toEqual(0);
    expect(count('run')).toEqual(1);
    // Keyed on the global.json that pins the SDK: each fixture ships its own.
    expect(count('--info')).toEqual(2);
    expect(count('--list-runtimes')).toEqual(2);

    expect(first.scannedProjects[0].depGraph?.toJSON()).toEqual(
      expectedGraph(FIXTURES.dotnet8),
    );
    expect(second.scannedProjects[0].depGraph?.toJSON()).toEqual(
      expectedGraph(FIXTURES.dotnet8DifferentName),
    );
  }, 200000);

  it('reuses everything when the same project is scanned again', async () => {
    await inspect(FIXTURES.dotnet8);
    const before = spawns.mock.calls.length;

    const again = await inspect(FIXTURES.dotnet8);

    expect(spawns.mock.calls.length).toEqual(before);
    expect(again.scannedProjects[0].depGraph?.toJSON()).toEqual(
      expectedGraph(FIXTURES.dotnet8),
    );
  }, 200000);

  it('parses each distinct target framework once across projects', async () => {
    const net8 = await inspect(FIXTURES.dotnet8);
    const net10 = await inspect(FIXTURES.dotnet10);

    expect(count('build')).toEqual(1);
    expect(count('run')).toEqual(2);
    expect(net8.scannedProjects[0].meta?.targetRuntime).toEqual('net8.0');
    expect(net10.scannedProjects[0].meta?.targetRuntime).toEqual('net10.0');
  }, 200000);

  it('parses each target framework of a multi-targeting project', async () => {
    await restoreFixture(FIXTURES.dotnet6And7);
    dotnetCache.reset();
    spawns.mockClear();

    const result = await inspect(FIXTURES.dotnet6And7);

    expect(count('run')).toEqual(2);
    expect(
      result.scannedProjects.map((project) => project.meta?.targetRuntime),
    ).toEqual(['net6.0', 'net7.0']);
  }, 200000);

  it('does not cache a failed dotnet availability check', async () => {
    spawns.mockRejectedValueOnce(new Error('spawn dotnet ENOENT'));

    expect(await dotnet.isInstalled()).toBe(false);
    expect(await dotnet.isInstalled()).toBe(true);
    expect(count('--version')).toEqual(2);
  });
});
