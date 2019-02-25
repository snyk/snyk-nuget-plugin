'use strict';
const test = require('tap').test;
const plugin = require('../lib/index');
const determineDotnetVersion = require('../lib/nuget-parser/csproj-parser');

const multipleFrameworksPath = './test/stubs/target_framework/csproj_multiple/';
const noProjectPath = './test/stubs/target_framework/no_csproj/';
const noValidFrameworksPath =
  './test/stubs/target_framework/no_target_valid_framework';
const manifestFile = 'obj/project.assets.json';

test('parse dotnet with csproj containing multiple versions', function (t) {
  const dotnetVersions = determineDotnetVersion(
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
