import * as tap from 'tap';
const test = tap.test;
import * as path from 'path';
import * as plugin from '../lib/index';
import * as fs from 'fs';
const projectPath = './test/stubs/dotnet_p_g';
const manifestFile = 'obj/project.assets.json';
const expectedTree = JSON.parse(fs.readFileSync('./test/stubs/dotnet_p_g/expected.json', 'utf-8'));

test('parse dotnet-cli project and traverse packages', async (t) => {
  try {
    const result = await plugin.inspect(
      projectPath,
      manifestFile,
      {packagesFolder: path.resolve(projectPath, '_packages')});
    t.deepEqual(result, expectedTree, 'expects project data to be correct');
  } catch (error) {
    t.fail('Error was thrown: ' + error);
  }
});
