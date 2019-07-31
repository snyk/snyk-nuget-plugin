import * as tap from 'tap';
const test = tap.test;
import * as plugin from '../lib/index';
const projectPath = './test/stubs/dummy_project_2/';
const manifestFile = 'obj/project.assets.json';

test('parse dotnet-cli project without frameworks field', async (t) => {
  try {
    await plugin.inspect(projectPath, manifestFile, {packagesFolder: projectPath + './_packages'});
    t.fail('Expected an error to be thrown');
  } catch(error) {
    t.equals(error.message, 'No frameworks were found in project.assets.json');
  }
});
