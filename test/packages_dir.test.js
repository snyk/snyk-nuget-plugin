'use strict';
const path = require('path');
const test = require('tap').test;
const plugin = require('../lib/index');
const projectPath = './test/stubs/packages_dir';

const app1Path = projectPath + '/only_jquery/';
const app1ManifestFile = 'packages.config';
const app1ExpectedTree = require(path.resolve(app1Path, 'expected.json'));

const app2Path = projectPath + '/only_jquery_but_wrong_version/';
const app2ManifestFile = 'packages.config';
const app2ExpectedTree = require(path.resolve(app2Path, 'expected.json'));

const app3Path = projectPath + '/only_momentjs/';
const app3ManifestFile = 'packages.config';
const app3ExpectedTree = require(path.resolve(app3Path, 'expected.json'));

test('packages contains many deps: only jquery', function (t) {
  plugin.inspect(
    app1Path,
    app1ManifestFile,
    {
      packagesFolder: projectPath + '/packages',
    })
    .then(function (result) {
      t.ok(result.package.dependencies.jQuery,
        'jQuery should be found because specified');
      t.notOk(result.package.dependencies['Moment.js'],
        'Moment.js should not be found, even though exists in packages');
      t.deepEqual(
        result,
        app1ExpectedTree,
        'expects project data to be correct'
      );
      t.end();
    })
    .catch(function (err) {
      t.fail('Error was thrown: ' + err);
    });
});


test('packages contains many deps: only moment', function (t) {
  plugin.inspect(
    app3Path,
    app3ManifestFile,
    {
      packagesFolder: projectPath + '/packages',
    })
    .then(function (result) {
      t.ok(result.package.dependencies['Moment.js'],
        'Moment.js should be found because specified');
      t.notOk(result.package.dependencies.jQuery,
        'jQuery should not be found, even though exists in packages');
      t.deepEqual(
        result,
        app3ExpectedTree,
        'expects project data to be correct'
      );
      t.end();
    })
    .catch(function (err) {
      t.fail('Error was thrown: ' + err);
    });
});


test('packages contains many deps: different jquery version', function (t) {
  plugin.inspect(
    app2Path,
    app2ManifestFile,
    {
      packagesFolder: projectPath + '/packages',
    })
    .then(function (result) {
      t.ok(result.package.dependencies.jQuery,
        'jQuery should be found because specified');
      t.ok(result.package.dependencies.jQuery.version === '3.2.1',
        'should find version as in packages folder 3.2.1, but found ' +
        result.package.dependencies.jQuery.version);
      t.deepEqual(
        result,
        app2ExpectedTree,
        'expects project data to be correct'
      );
      t.end();
    })
    .catch(function (err) {
      t.fail('Error was thrown: ' + err);
    });
});
