import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';

import * as plugin from '../lib/index';

describe('when parsing with traverse', () => {
  const targetProjectJsonFile = './test/stubs/dummy_project_1/';
  const targetPackagesConfigFile =
    targetProjectJsonFile + 'dummy_project_1/packages.config';

  it('parse _2_project.json - like and traverse packages', async () => {
    const targetJSONManifestData = JSON.parse(
      fs.readFileSync('./test/stubs/_2_project.json', 'utf-8'),
    );

    const expectedTreeFile = fs.readFileSync(
      targetProjectJsonFile + 'dummy_project_1/expected_csproj.json',
    );
    const expectedTree = JSON.parse(expectedTreeFile.toString());
    // NUnit can be referenced in .nuspec files.
    // In this test the manifest file has no NUnit reference,
    // therefor it is not expected to be in the result.
    delete expectedTree.package.dependencies.NUnit;
    const result = await plugin.inspect(
      targetProjectJsonFile,
      '../_2_project.json',
      { packagesFolder: targetProjectJsonFile + '/packages' },
    );
    // In case project details are included in manifest file,
    // it's expected to be included in the 'package' section
    expect(result.package.name).toBe(
      targetJSONManifestData.project.restore.projectName,
    );
    expect(result.package.version).toBe(targetJSONManifestData.project.version);
    expect(result.package.dependencies).toEqual(
      expectedTree.package.dependencies,
    );
    expect(result.plugin).toBeTruthy();
  });

  it('parse packages.config and traverse packages', async () => {
    const expectedTreeFile = fs.readFileSync(
      targetProjectJsonFile + 'dummy_project_1/expected_pkgcfg.json',
    );
    const expectedTree = JSON.parse(expectedTreeFile.toString());

    const result = await plugin.inspect(null, targetPackagesConfigFile, null);
    expect(result.package.dependencies).toEqual(
      expectedTree.package.dependencies,
    );
    expect(result.plugin).toBeTruthy();
    expect(result.plugin.name).toBe('snyk-nuget-plugin');
  });

  it('parse packages.config and traverse alternate packages folder', async () => {
    const expectedTreeFile = fs.readFileSync(
      targetProjectJsonFile + 'dummy_project_1/expected_pkgcfg.json',
    );
    const expectedTree = JSON.parse(expectedTreeFile.toString());

    const alternatePackagesFolder =
      targetProjectJsonFile + 'alternate_packages';
    const result = await plugin.inspect(null, targetPackagesConfigFile, {
      packagesFolder: alternatePackagesFolder,
    });
    expect(result.package.dependencies).toEqual(
      expectedTree.package.dependencies,
    );
    expect(result.plugin).toBeTruthy();
    expect(result.plugin.name).toBe('snyk-nuget-plugin');
  });
});
