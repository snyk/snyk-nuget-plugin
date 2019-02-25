'use strict';
const test = require('tap').test;
const plugin = require('../lib/index');
const projectPath = './test/stubs/dotnet_project';
const manifestFile = 'obj/project.assets.json';
const expectedTree = require('./stubs/dotnet_project/expected.json');

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
