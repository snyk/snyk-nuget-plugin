var test = require('tap').test;
var plugin = require('../lib/index');
var projectPath = './test/stubs/two_deps_solution/';
var app1Path = projectPath + 'FirstApplication/';
var app2Path = projectPath + 'secondApp/';
var app1ManifestFile = 'secondApp.csproj';
var app2ManifestFile = 'secondApp.csproj';
var expectedTree = require('./stubs/two_deps_solution/expected.json');

test('parse two_deps_solution project and traverse packages', function (t) {
  plugin.inspect(
    projectPath,
    manifestFile,
    {
      packagesFolder: projectPath + './packages',
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