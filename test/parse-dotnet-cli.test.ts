import * as tap from 'tap';
const test = tap.test;
import * as plugin from '../lib/index';
const projectPath = './test/stubs/dummy_project_2/';
const manifestFile = 'obj/project.assets.json';

const packagesConfigOnlyPath = './test/stubs/packages-config-only/';
const packagesConfigOnlyManifestFile = 'packages.config';

test('parse dotnet-cli project without frameworks field', async (t) => {
  try {
    await plugin.inspect(projectPath, manifestFile, {packagesFolder: projectPath + './_packages'});
    t.fail('Expected an error to be thrown');
  } catch(error) {
    t.equals(error.message, 'No frameworks were found in project.assets.json');
  }
});

test('parse dotnet-cli project with packages.config only', async (t) => {
  const res = await plugin.inspect(packagesConfigOnlyPath, packagesConfigOnlyManifestFile);
  t.equal(res.package.name, 'packages-config-only', 'expected packages-config-only name');
  // expect the first found targetRuntime to be returned by the plugin
  t.equal(res.plugin.targetRuntime, 'net452', 'expected net452 framework');
  t.ok(res.package.dependencies.jQuery, 'jQuery should be found because specified');
  t.ok(res.package.dependencies['Moment.js'], 'Moment.js should be found because specified');
});
