var path = require('path');
var test = require('tap').test;
var plugin = require('../lib/index');
var projectPath = './test/stubs/packages_dir';

var app1Path = projectPath + '/only_jquery/';
var app1ManifestFile = 'packages.config';
var app1ExpectedTree = require(path.resolve(app1Path, 'expected.json'));

var app2Path = projectPath + '/only_jquery_but_wrong_version/';
var app2ManifestFile = 'packages.config';
var app2ExpectedTree = require(path.resolve(app2Path, 'expected.json'));

var app3Path = projectPath + '/only_momentjs/';
var app3ManifestFile = 'packages.config';
var app3ExpectedTree = require(path.resolve(app3Path, 'expected.json'));

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
    .catch(function (error) {
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
    .catch(function (error) {
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
      t.ok(result.package.dependencies.jQuery.version == '3.2.1',
        'should find version as in packages folder 3.2.1, but found ' +
        result.package.dependencies.jQuery.version);
      t.deepEqual(
        result,
        app2ExpectedTree,
        'expects project data to be correct'
      );
      t.end();
    })
    .catch(function (error) {
      t.fail('Error was thrown: ' + err);
    });
});
