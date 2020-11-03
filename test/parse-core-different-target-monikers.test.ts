import * as tap from 'tap';
const test = tap.test;
import * as plugin from '../lib/index';
import * as fs from 'fs';
const projectPath = './test/stubs/CoreDifferentTargetMonikers/';
const manifestFile = 'obj/project.assets.json';
const expectedTree = JSON.parse(fs.readFileSync('./test/stubs/CoreDifferentTargetMonikers/expected.json', 'utf-8'));

test('parse core with different target monikers', async (t) => {
  try {
    const result = await plugin.inspect(projectPath, manifestFile);
    t.deepEqual(result, expectedTree, 'expects project data to be correct');
  } catch(error) {
    t.fail('Error was thrown: ' + error);
  }
});