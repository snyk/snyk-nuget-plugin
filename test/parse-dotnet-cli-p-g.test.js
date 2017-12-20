var test = require('tap').test;
var plugin = require('../lib/index');
var projectPath = './test/stubs/dotnet_p_g/';
var manifestFile = projectPath + 'obj/project.assets.json';
var expectedTree = require('./stubs/dotnet_p_g/expected.json');

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