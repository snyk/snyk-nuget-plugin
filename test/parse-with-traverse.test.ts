import * as tap from 'tap';
const test = tap.test;
import * as fs from 'fs';

import * as plugin from '../lib/index';
const targetProjectJsonFile = './test/stubs/dummy_project_1/';
const targetPackagesConfigFile = targetProjectJsonFile + 'dummy_project_1/packages.config';
const alternatePackagesFolder = targetProjectJsonFile + 'alternate_packages';
const targetJSONManifestData = JSON.parse(fs.readFileSync('./test/stubs/_2_project.json', 'utf-8'));

test('parse _2_project.json - like and traverse packages', async (t) => {
  try {
  const expectedTreeFile = fs.readFileSync(targetProjectJsonFile + 'dummy_project_1/expected_csproj.json');
  const expectedTree = JSON.parse(expectedTreeFile.toString());
  // NUnit can be referenced in .nuspec files.
  // In this test the manifest file has no NUnit reference,
  // therefor it is not expected to be in the result.
  delete expectedTree.package.dependencies.NUnit;
  const result = await plugin.inspect(
    targetProjectJsonFile,
    '../_2_project.json',
    {packagesFolder: targetProjectJsonFile + '/packages'});
    // In case project details are included in manifest file,
    // it's expected to be included in the 'package' section
  t.equal(
    result.package.name,
    targetJSONManifestData.project.restore.projectName,
    'expects extraction of project\'s name from manifest');
  t.equal(
    result.package.version,
    targetJSONManifestData.project.version,
    'expects extraction of project\'s version from manifest');
  t.deepEqual(
    result.package.dependencies,
    expectedTree.package.dependencies,
    'expects dependency tree to be correct');
  t.ok(result.plugin);
  } catch (err) {
    t.fail(err.message);
  }
});

test('parse packages.config and traverse packages', async (t) => {
  const expectedTreeFile = fs.readFileSync(targetProjectJsonFile + 'dummy_project_1/expected_pkgcfg.json');
  const expectedTree = JSON.parse(expectedTreeFile.toString());

  const result = await plugin.inspect(null, targetPackagesConfigFile, null);
  t.deepEqual(result.package.dependencies, expectedTree.package.dependencies, 'dep trees should be equal');
  t.ok(result.plugin);
  t.equal(result.plugin.name, 'snyk-nuget-plugin');
});

test('parse packages.config and traverse alternate packages folder', async (t) => {
  const expectedTreeFile = fs.readFileSync(targetProjectJsonFile + 'dummy_project_1/expected_pkgcfg.json');
  const expectedTree = JSON.parse(expectedTreeFile.toString());

  const result = await plugin.inspect(null, targetPackagesConfigFile, {packagesFolder: alternatePackagesFolder});
  t.deepEqual(result.package.dependencies, expectedTree.package.dependencies);
  t.ok(result.plugin);
  t.equal(result.plugin.name, 'snyk-nuget-plugin');
});
