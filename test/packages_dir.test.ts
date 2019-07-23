import * as path from 'path';
import * as fs from 'fs';
import * as tap from 'tap';
const test = tap.test;
import * as plugin from '../lib/index';
const projectPath = './test/stubs/packages_dir';

const app1Path = projectPath + '/only_jquery/';
const app1ManifestFile = 'packages.config';
const app1ExpectedTree = JSON.parse(fs.readFileSync(path.resolve(app1Path, 'expected.json'), 'utf-8'));

const app2Path = projectPath + '/only_jquery_but_wrong_version/';
const app2ManifestFile = 'packages.config';
const app2ExpectedTree = JSON.parse(fs.readFileSync(path.resolve(app2Path, 'expected.json'), 'utf-8'));

const app3Path = projectPath + '/only_momentjs/';
const app3ManifestFile = 'packages.config';
const app3ExpectedTree = JSON.parse(fs.readFileSync(path.resolve(app3Path, 'expected.json'), 'utf-8'));

test('packages contains many deps: only jquery', async (t) => {
  try {
    const result = await plugin.inspect(app1Path, app1ManifestFile, {packagesFolder: projectPath + '/packages'});
    t.ok(result.package.dependencies.jQuery, 'jQuery should be found because specified');
    t.notOk(result.package.dependencies['Moment.js'], 'Moment.js should not be found, even though exists in packages');
    t.deepEqual(result, app1ExpectedTree, 'expects project data to be correct');
  } catch(err) {
    t.fail('Error was thrown: ' + err);
  }
});

test('packages contains many deps: only moment', async (t) => {
  try {
    const result = await plugin.inspect(app3Path, app3ManifestFile, {packagesFolder: projectPath + '/packages'});
    t.ok(result.package.dependencies['Moment.js'], 'Moment.js should be found because specified');
    t.notOk(result.package.dependencies.jQuery, 'jQuery should not be found, even though exists in packages');
    t.deepEqual(result, app3ExpectedTree, 'expects project data to be correct');
  } catch(err) {
    t.fail('Error was thrown: ' + err);
  }
});

test('packages contains many deps: different jquery version', async (t) => {
  try {
    const res = await plugin.inspect(app2Path, app2ManifestFile, {packagesFolder: projectPath + '/packages'});
    t.ok(res.package.dependencies.jQuery, 'jQuery should be found because specified');
    t.ok(res.package.dependencies.jQuery.version === '3.2.1',
      'should find version as in packages folder 3.2.1, but found ' + res.package.dependencies.jQuery.version);
    t.deepEqual(res, app2ExpectedTree, 'expects project data to be correct');
  } catch(err) {
    t.fail('Error was thrown: ' + err);
  }
});
