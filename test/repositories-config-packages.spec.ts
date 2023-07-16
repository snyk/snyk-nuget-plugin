import * as path from 'path';
import * as fs from 'fs';
import { describe, expect, it } from '@jest/globals';
import * as plugin from '../lib/index';

const projectPath = './test/stubs/repositories-config';
const manifestFile = 'packages.config';
const packagesFolder = projectPath + '/packages';
const expectedTree = JSON.parse(
  fs.readFileSync(path.resolve(projectPath, 'expected.json'), 'utf-8'),
);

describe('when parsing repositories config', () => {
  it('packages contains many deps: only jquery', async () => {
    const result = await plugin.inspect(projectPath, manifestFile, {
      packagesFolder,
    });
    expect(result).toEqual(expectedTree);
  });
});
