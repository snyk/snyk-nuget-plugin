var test = require('tap').test;
var plugin = require('../lib/index');
var projectPath = './test/stubs/dotnet_project';
var manifestFile = 'obj/project.assets.json';
var expectedTree = require('./stubs/dotnet_project/expected.json');

test('parse dotnet-cli 2 project and traverse packages', function (t) {
  plugin.inspect(
    projectPath,
    manifestFile)
    .then(function (result) {
      t.deepEqual(
        result,
        expectedTree,
        'expects project data to be correct'
      );
      t.end();
    })
    .catch(function (error) {
      t.fail('Error was thrown: ' + error);
    });
});
