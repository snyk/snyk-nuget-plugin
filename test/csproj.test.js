'use strict';
const test = require('tap').test;
const plugin = require('../lib/index');
const determineDotnetVersion = require('../lib/nuget-parser/csproj-parser');

const multipleFrameworksPath = './test/stubs/target_framework/csproj_multiple/';
const noProjectPath = './test/stubs/target_framework/no_csproj/';
const noValidFrameworksPath =
  './test/stubs/target_framework/no_target_valid_framework';
const manifestFile = 'obj/project.assets.json';

test('parse dotnet with csproj containing multiple versions retrieves first one', function (t) {
  const dotnetVersions = determineDotnetVersion(
    multipleFrameworksPath);
  t.equal('netcoreapp2.0', dotnetVersions.original);
  t.end();
});

test('parse dotnet with vbproj', function (t) {
  plugin.inspect(
    noProjectPath,
    manifestFile)
    .then(function (res) {
      t.equal(res.package.name, 'no_csproj');
      t.equal(res.plugin.targetRuntime, 'netcoreapp2.0');
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
      t.equal(err.message, 'No frameworks were found in project.assets.json', 'expected error');
      t.end();
    });
});
