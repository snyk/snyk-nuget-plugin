import * as path from 'path';
import * as fs from 'fs';
import * as tap from 'tap';
const test = tap.test;
import * as plugin from '../lib/index';

const projectPath = './test/stubs/repositories-config';
const manifestFile = 'packages.config';
const packagesFolder = projectPath + '/packages';
const expectedTree = JSON.parse(fs.readFileSync(path.resolve(projectPath, 'expected.json'), 'utf-8'));

test('packages contains many deps: only jquery', async (t) => {
  const result = await plugin.inspect(projectPath, manifestFile, {packagesFolder});
  t.deepEqual(result, expectedTree, 'expects project data to be correct');
});
