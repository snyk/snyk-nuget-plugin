'use strict';
const test = require('tap').test;
const path = require('path');
const plugin = require('../lib/index');
const projectPath = './test/stubs/dotnet_p_g';
const manifestFile = 'obj/project.assets.json';
const expectedTree = require('./stubs/dotnet_p_g/expected.json');

test('parse dotnet-cli project and traverse packages', function (t) {
  plugin.inspect(
    projectPath,
    manifestFile,
    {
      packagesFolder: path.resolve(projectPath, '_packages'),
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
      t.fail('Error was thrown: ' + error);
    });
});
