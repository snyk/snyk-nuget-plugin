import { describe, expect, it } from '@jest/globals';
import * as plugin from '../../lib';
import * as path from 'path';
import * as fs from 'fs';
import { legacyPlugin as pluginApi } from '@snyk/cli-interface';

const projectJsonDir = './test/fixtures/packages-lock-json';

describe('when testing a packages.lock.json file', () => {
  it('returns the expected dependency tree', async () => {
    const expected = JSON.parse(
      fs
        .readFileSync(path.resolve(projectJsonDir, 'expected_depgraph.json'))
        .toString('utf-8'),
    );

    const result = await plugin.inspect(projectJsonDir, 'packages.lock.json');

    if (pluginApi.isMultiResult(result) || !result?.package) {
      throw new Error('received invalid depTree');
    }

    expect(result.package.dependencies).toEqual(expected);
    expect(result.package.name).toBe('packages-lock-json');
  });
});
