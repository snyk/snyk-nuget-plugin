import * as tap from 'tap';
const test = tap.test;
import * as plugin from '../lib/index';
import * as fs from 'fs';
const projectPath = './test/stubs/dotnet_2/';
const manifestFile = projectPath + 'obj/project.assets.json';
const expectedTree = JSON.parse(fs.readFileSync('./test/stubs/dotnet_2/expected.json', 'utf-8'));

test('parse dotnet-cli 2 with duplicate deps project and traverse packages', async (t) => {
  try {
    const result = await plugin.inspect(null, manifestFile)
    t.deepEqual(result, expectedTree, 'expects project data to be correct');
  } catch (error) {
    t.fail('Error was thrown: ' + error);
  }
});
