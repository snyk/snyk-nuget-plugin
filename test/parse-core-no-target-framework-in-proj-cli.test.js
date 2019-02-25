'use strict';
const test = require('tap').test;
const plugin = require('../lib/index');
const projectPath = './test/stubs/CoreNoTargetFrameworkInProj/';
const manifestFile = 'obj/project.assets.json';
const expectedTree = require('./stubs/CoreNoTargetFrameworkInProj/expected.json');

test('parse core without target framework in proj cli', function (t) {
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
