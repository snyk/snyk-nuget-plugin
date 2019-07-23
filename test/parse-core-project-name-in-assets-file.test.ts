import * as tap from 'tap';
const test = tap.test;
import * as plugin from '../lib/index';
import * as fs from 'fs';
const projectPath = './test/stubs/CoreProjectNameInAssets/';
const manifestFile = 'obj/project.assets.json';
const expectedTreeWithAssetsProjectNameArgument
  = JSON.parse(fs.readFileSync(
    './test/stubs/CoreProjectNameInAssets/expectedWithAssetsProjectNameArgument.json', 'utf-8'));
const expectedTreeWithoutAssetsProjectNameArgument
  = JSON.parse(fs.readFileSync(
    './test/stubs/CoreProjectNameInAssets/expectedWithoutAssetsProjectNameArgument.json', 'utf-8'));

test('parse core with project name in project assets file with assets-project-name', async (t) => {
  try {
    const result = await plugin.inspect(projectPath, manifestFile, {'assets-project-name': true});
    t.deepEqual(result, expectedTreeWithAssetsProjectNameArgument, 'expects project data to be correct');
  } catch(error) {
    t.fail('Error was thrown: ' + error);
  }
});

test('parse core with project name in project assets file without assets-project-name', async (t) => {
  try {
    const result = await plugin.inspect(projectPath, manifestFile)
    t.deepEqual(result, expectedTreeWithoutAssetsProjectNameArgument, 'expects project data to be correct');
  } catch(error) {
    t.fail('Error was thrown: ' + error);
  }
});
