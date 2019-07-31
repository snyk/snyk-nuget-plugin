import * as tap from 'tap';
const test = tap.test;
import * as plugin from '../lib/index';
import * as fs from 'fs';
const projectPath = './test/stubs/CoreNoTargetFrameworkInProj/';
const manifestFile = 'obj/project.assets.json';
const expectedTree = JSON.parse(fs.readFileSync('./test/stubs/CoreNoTargetFrameworkInProj/expected.json', 'utf-8'));

test('parse core without target framework in proj cli', async (t) => {
  try {
    const result = await plugin.inspect(projectPath, manifestFile);
    t.deepEqual(result, expectedTree, 'expects project data to be correct');
  } catch(error) {
    t.fail('Error was thrown: ' + error);
  }
});
