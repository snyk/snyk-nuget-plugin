var test = require('tap').test;
var plugin = require('../lib/index');
var projectPath = './test/stubs/dummy_project_2/';
var manifestFile = 'obj/project.assets.json';
var expectedTree = require('./stubs/dummy_project_2/expected.json');

test('parse dotnet-cli project and traverse packages', function (t) {
  plugin.inspect(
    projectPath,
    manifestFile,
    {
      packagesFolder: projectPath + './_packages',
    })
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