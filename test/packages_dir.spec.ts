import * as path from 'path';
import * as fs from 'fs';
import { expect, test } from '@jest/globals';
import * as plugin from '../lib/index';

const projectPath = './test/stubs/packages_dir';

const app1Path = projectPath + '/only_jquery/';
const app1ManifestFile = 'packages.config';
const app1ExpectedTree = JSON.parse(
  fs.readFileSync(path.resolve(app1Path, 'expected.json'), 'utf-8'),
);

const app2Path = projectPath + '/only_jquery_but_wrong_version/';
const app2ManifestFile = 'packages.config';
const app2ExpectedTree = JSON.parse(
  fs.readFileSync(path.resolve(app2Path, 'expected.json'), 'utf-8'),
);

const app3Path = projectPath + '/only_momentjs/';
const app3ManifestFile = 'packages.config';
const app3ExpectedTree = JSON.parse(
  fs.readFileSync(path.resolve(app3Path, 'expected.json'), 'utf-8'),
);

describe('when calling plugin', () => {
  it('packages contains many deps: only jquery', async () => {
    const result = await plugin.inspect(app1Path, app1ManifestFile, {
      packagesFolder: projectPath + '/packages',
    });
    expect(result.package.dependencies.jQuery).toBeTruthy();
    expect(result.package.dependencies['Moment.js']).toBeFalsy();
    expect(result).toEqual(app1ExpectedTree);
  });

  it('packages contains many deps: only moment', async () => {
    const result = await plugin.inspect(app3Path, app3ManifestFile, {
      packagesFolder: projectPath + '/packages',
    });
    expect(result.package.dependencies['Moment.js']).toBeTruthy();
    expect(result.package.dependencies.jQuery).toBeFalsy();
    expect(result).toEqual(app3ExpectedTree);
  });

  it('packages contains many deps: different jquery version', async () => {
    const res = await plugin.inspect(app2Path, app2ManifestFile, {
      packagesFolder: projectPath + '/packages',
    });
    expect(res.package.dependencies.jQuery).toBeTruthy();
    expect(res.package.dependencies.jQuery.version === '3.2.1').toBeTruthy();
    expect(res).toEqual(app2ExpectedTree);
  });
});
