import * as tap from 'tap';
const test = tap.test;
import * as plugin from '../lib/index';
import * as fs from 'fs';
const projectPath = './test/stubs/CoreNoProjectNameInAssets/';
const manifestFile = 'obj/project.assets.json';
const expectedTree = JSON.parse(fs.readFileSync('./test/stubs/CoreNoProjectNameInAssets/expected.json', 'utf-8'));

test('parse core without project name in project assets file with assets-project-name argument', async (t) => {
  try {
    const result = await plugin.inspect(projectPath, manifestFile, {'assets-project-name': true})
    t.deepEqual(result, expectedTree, 'expects project data to be correct',);
  } catch(error) {
    t.fail('Error was thrown: ' + error);
  }
});

test('parse core without project name in project assets file without assets-project-name argument', async (t) => {
  try {
    const result = await plugin.inspect(projectPath, manifestFile);
    t.deepEqual(result, expectedTree, 'expects project data to be correct');
  } catch (error) {
    t.fail('Error was thrown: ' + error);
  }
});
