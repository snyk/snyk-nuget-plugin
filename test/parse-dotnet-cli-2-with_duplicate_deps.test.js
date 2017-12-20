var test = require('tap').test;
var plugin = require('../lib/index');
var projectPath = './test/stubs/dotnet_2/';
var manifestFile = projectPath + 'obj/project.assets.json';
var expectedTree = require('./stubs/dotnet_2/expected.json');

test('parse dotnet-cli 2 project and traverse packages', function (t) {
  plugin.inspect(
    null,
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
      t.fail('Error was thrown: ' + err);
    });
});