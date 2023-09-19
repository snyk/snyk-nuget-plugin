import { describe, expect, it } from '@jest/globals';
import * as plugin from '../../lib';
import { legacyPlugin as pluginApi } from '@snyk/cli-interface';

const fixturesDir = './test/fixtures/paket';
const simplePaket = fixturesDir + '/simple/';
const missingLock = fixturesDir + '/missing-lock/';

const simplePaketDeps = {
  FAKE: {
    depType: 'prod',
    dependencies: {},
    name: 'FAKE',
    version: '5.8.4',
  },
  'FSharp.Formatting': {
    depType: 'prod',
    dependencies: {
      'FSharp.Compiler.Service': {
        depType: 'prod',
        dependencies: {},
        name: 'FSharp.Compiler.Service',
        version: '2.0.0.6',
      },
      'FSharpVSPowerTools.Core': {
        depType: 'prod',
        dependencies: {
          'FSharp.Compiler.Service': {
            depType: 'prod',
            dependencies: {},
            name: 'FSharp.Compiler.Service',
            version: '2.0.0.6',
          },
        },
        name: 'FSharpVSPowerTools.Core',
        version: '2.3',
      },
    },
    name: 'FSharp.Formatting',
    version: '2.14.4',
  },
};

describe('when testing paket', () => {
  it('parse simple-paket project', async () => {
    const result = await plugin.inspect(simplePaket, 'paket.dependencies');

    if (pluginApi.isMultiResult(result) || !result?.package) {
      throw new Error('received invalid depTree');
    }

    expect(result.package.dependencies).toEqual(simplePaketDeps);
    expect(result.package.name).toBe('simple');
  });

  it('parse simple-paket project from upper dir', async () => {
    const result = await plugin.inspect(
      fixturesDir,
      'simple/paket.dependencies',
    );

    if (pluginApi.isMultiResult(result) || !result?.package) {
      throw new Error('received invalid depTree');
    }

    expect(result.package.dependencies).toEqual(simplePaketDeps);
    expect(result.package.name).toBe('simple');
  });

  it('fail to parse paket with missing lock file project', async () => {
    await expect(
      async () => await plugin.inspect(missingLock, 'paket.dependencies'),
    ).rejects.toThrow(/Lockfile not found at location.*/);
  });
});
