var test = require('tap').test;
var plugin = require('../lib/index');
var projectPath = './test/stubs/dummy_project_2/';
var manifestFile = 'obj/project.assets.json';
var expectedTree = require('./stubs/dummy_project_2/expected.json');
var fs = require('fs');

test('parse dotnet-cli project without frameworks field', function (t) {
  plugin.inspect(
    projectPath,
    manifestFile,
    {
      packagesFolder: projectPath + './_packages',
    }).then(function () {
      t.fail('Expected an error to be thrown');
    })
    .catch(function (error) {
      t.equals(error.message,
        'No frameworks were found in project.assets.json');
      t.end();
    });
});