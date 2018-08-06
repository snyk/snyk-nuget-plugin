var test = require('tap').test;
var plugin = require('../lib/index');
var determineDotnetVersion = require('../lib/proj-parser');

var multipleFrameworksPath = './test/stubs/target_framework/csproj_multiple/';
var noProjectPath = './test/stubs/target_framework/no_csproj/';
var noFrameworksPath = './test/stubs/target_framework/no_target_framework';
var noValidFrameworksPath =
  './test/stubs/target_framework/no_target_valid_framework';
var manifestFile = 'obj/project.assets.json';

test('parse dotnet with csproj containing multiple versions', function (t) {
  var dotnetVersions = determineDotnetVersion(
    multipleFrameworksPath);
  t.ok(dotnetVersions, ['.NETCore2.0','.NETFramework462']);
  t.end();
});

test('parse dotnet with vbproj', function (t) {
  plugin.inspect(
    noProjectPath,
    manifestFile)
    .then(function () {
      t.fail('Expected error to be thrown!');
    })
    .catch(function (err) {
      t.ok(/\.csproj file not found.*/.test(err.toString()), 'expected error');
      t.end();
    });
});

test('parse dotnet without any target framework fields', function (t) {
  plugin.inspect(
    noFrameworksPath,
    manifestFile)
    .then(function () {
      t.fail('Expected error to be thrown!');
    })
    .catch(function (err) {
      t.ok(/Could not find TargetFrameworkVersion.*/
        .test(err.toString()), 'expected error');
      t.end();
    });
});

test('parse dotnet with no valid framework defined', function (t) {
  plugin.inspect(
    noValidFrameworksPath,
    manifestFile)
    .then(function () {
      t.fail('Expected error to be thrown!');
    })
    .catch(function (err) {
      t.ok(/Could not find valid\/supported \.NET version.*/
        .test(err.toString()), 'expected error');
      t.end();
    });
});
